import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { protectedProcedure } from "@/server/procedures";
import { applySrsReview, loadSrsScheduleSettings } from "@/lib/srs/apply";
import { collectDeckBranchIds, computeDeckDepths } from "@/lib/decks/tree";
import { addUtcDays, endOfUtcDay, startOfUtcDay } from "@/lib/srs/dates";
import {
  DEFAULT_STUDY_MAX_CARDS,
  STUDY_RATING_COUNTER_FIELD,
} from "@/constants/study";
import type { SrsRating } from "@/constants/srs";
import { countBuckets, limitQueue, toAccuracy, type StudyQueueCandidate } from "@/lib/study/queue";
import {
  studyCardSelect,
  studySessionSelect,
  toQueueItem,
  toStudyCardView,
  toStudyDailyStatEntry,
  toStudyHistoryEntry,
  toStudySessionView,
  type StudySessionWithDeck,
} from "@/lib/study/serialize";
import {
  studyCompleteInputSchema,
  studyDailyStatsInputSchema,
  studyHistoryInputSchema,
  studyOverviewInputSchema,
  studyPauseInputSchema,
  studyReviewInputSchema,
  studySessionInputSchema,
  studyStartInputSchema,
  type StudyStartInput,
} from "@/lib/validation/study";
import type { StudyQueueCounts, StudyResumable, StudySrsScheduleSettings } from "@/types/study";
import type {
  StudyDailyStatEntry,
  StudyDailyStatsResult,
  StudyDeckOption,
  StudyHistoryResult,
  StudyLimits,
  StudyOverview,
  StudyPauseResult,
  StudyReviewResult,
  StudySessionState,
  StudyStartResult,
  StudySummary,
} from "@/types/study";

/** Ventana de "próximos N días" que se informa en el panel para el estudio anticipado (RF-017). */
const UPCOMING_WINDOW_DAYS = 7;

const DEFAULT_LIMITS = {
  maxNewCardsPerDay: 20,
  maxReviewsPerDay: 100,
};

/* ------------------------------------------------------------------------- */
/* Utilidades de fecha y límites diarios                                       */
/* ------------------------------------------------------------------------- */

/** Inicio del día en UTC: `daily_study_stats.study_date` es una columna DATE. */
function today(now: Date): Date {
  return startOfUtcDay(now);
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Límites diarios del usuario (RF-003), con los valores por defecto de la spec como respaldo. */
async function loadUserLimits(userId: string): Promise<{
  maxNewCardsPerDay: number;
  maxReviewsPerDay: number;
}> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { maxNewCardsPerDay: true, maxReviewsPerDay: true },
  });

  return {
    maxNewCardsPerDay: settings?.maxNewCardsPerDay ?? DEFAULT_LIMITS.maxNewCardsPerDay,
    maxReviewsPerDay: settings?.maxReviewsPerDay ?? DEFAULT_LIMITS.maxReviewsPerDay,
  };
}

/**
 * Cuánto del cupo diario se ha consumido ya (RF-003).
 *
 * `daily_study_stats` es la fuente de verdad: el módulo de estudio lo mantiene en
 * la misma transacción que la calificación, así que los contadores de la sesión y
 * los límites del día no pueden divergir.
 */
async function loadTodayUsage(
  userId: string,
  now: Date
): Promise<{ newDone: number; reviewDone: number }> {
  const stats = await prisma.dailyStudyStats.findUnique({
    where: { userId_studyDate: { userId, studyDate: today(now) } },
    select: { newCards: true, reviewCards: true },
  });

  return { newDone: stats?.newCards ?? 0, reviewDone: stats?.reviewCards ?? 0 };
}

async function resolveStudyLimits(userId: string, now: Date): Promise<StudyLimits> {
  const [configured, usage] = await Promise.all([loadUserLimits(userId), loadTodayUsage(userId, now)]);

  return {
    maxNewCardsPerDay: configured.maxNewCardsPerDay,
    maxReviewsPerDay: configured.maxReviewsPerDay,
    newRemaining: Math.max(0, configured.maxNewCardsPerDay - usage.newDone),
    reviewRemaining: Math.max(0, configured.maxReviewsPerDay - usage.reviewDone),
  };
}

/* ------------------------------------------------------------------------- */
/* Selección de tarjetas                                                       */
/* ------------------------------------------------------------------------- */

const candidateSelect = {
  id: true,
  createdAt: true,
  scheduling: {
    select: {
      status: true,
      dueDate: true,
      lastReviewedAt: true,
    },
  },
} satisfies Prisma.CardSelect;

type CandidateRow = Prisma.CardGetPayload<{ select: typeof candidateSelect }>;

/**
 * Ventana de vencimiento de la cola (RF-002, RF-017).
 *
 * `due_date` es una columna DATE: una tarjeta con intervalo en días vence a fin de
 * ese día, así que el límite superior del día en curso es el final de hoy. Con
 * `earlyDays > 0` la ventana se amplía ese número de días.
 */
function dueWindow(now: Date, earlyDays: number): { gte: Date; lte: Date } {
  return { gte: new Date(0), lte: endOfUtcDay(addUtcDays(now, Math.max(0, earlyDays))) };
}

/** Tarjetas candidatas a entrar en la cola: no suspendidas y con scheduling. */
async function loadCandidates(options: {
  userId: string;
  deckIds: string[];
  /** `null` = sin filtro de vencimiento (modo cram, RF-022). */
  window: { gte: Date; lte: Date } | null;
  take: number;
}): Promise<StudyQueueCandidate[]> {
  const rows: CandidateRow[] = await prisma.card.findMany({
    where: {
      userId: options.userId,
      isSuspended: false,
      deckId: { in: options.deckIds },
      scheduling: {
        dueDate: options.window
          ? { gte: options.window.gte, lte: options.window.lte }
          : undefined,
      },
    },
    select: candidateSelect,
    // El orden definitivo lo impone `limitQueue`; aquí solo se acota el volumen leído.
    orderBy: { scheduling: { dueDate: "asc" } },
    take: options.take,
  });

  return rows.flatMap((row) =>
    row.scheduling
      ? [
          {
            cardId: row.id,
            status: row.scheduling.status as StudyQueueCandidate["status"],
            dueDate: row.scheduling.dueDate,
            lastReviewedAt: row.scheduling.lastReviewedAt,
            createdAt: row.createdAt,
          },
        ]
      : []
  );
}

/**
 * Cuántas tarjetas se leen como máximo. El tope cubre la cuota del día más un
 * margen para el caso de "todos los mazos" en modo cram, que no tiene cupos.
 */
function candidateReadLimit(maxCards: number, limits: StudyLimits, isCramMode: boolean): number {
  if (isCramMode) {
    return maxCards;
  }

  return Math.min(maxCards * 2, limits.newRemaining + limits.reviewRemaining + maxCards);
}

/* ------------------------------------------------------------------------- */
/* Lectura de sesiones                                                         */
/* ------------------------------------------------------------------------- */

async function getOwnedSession(userId: string, sessionId: string): Promise<StudySessionWithDeck> {
  const session = await prisma.studySession.findFirst({
    where: { id: sessionId, userId },
    select: studySessionSelect,
  });

  if (!session) {
    throw new Error("La sesión de estudio no existe");
  }

  return session;
}

/** Estados de las tarjetas que quedan por calificar en la sesión (RF-012). */
async function loadPendingCounts(sessionId: string): Promise<StudyQueueCounts> {
  const pending = await prisma.studySessionCard.findMany({
    where: { sessionId, rating: null },
    select: { card: { select: { scheduling: { select: { status: true } } } } },
  });

  return countBuckets(pending.map((row) => row.card.scheduling?.status ?? "new"));
}

/** Cola pendiente de una sesión, en el orden en que se studyó. */
async function loadPendingQueue(sessionId: string) {
  const rows = await prisma.studySessionCard.findMany({
    where: { sessionId, rating: null },
    orderBy: { position: "asc" },
    select: {
      cardId: true,
      card: { select: { scheduling: { select: { status: true } } } },
    },
  });

  return rows.map((row) => toQueueItem(row.cardId, row.card.scheduling?.status ?? "new"));
}

/** Tarjetas de la sesión con su contenido, para pintar el anverso y el reverso. */
async function loadSessionCards(cardIds: string[]) {
  const rows = await prisma.card.findMany({
    where: { id: { in: cardIds } },
    select: studyCardSelect,
  });

  const byId = new Map(rows.map((row) => [row.id, toStudyCardView(row)]));

  // Se respeta el orden de la cola: una tarjeta borrada a mitad de sesión
  // simplemente no aparece y la interfaz la descarta sin romper el índice.
  return cardIds.flatMap((cardId) => {
    const card = byId.get(cardId);

    return card ? [card] : [];
  });
}

function toSrsSettingsView(settings: {
  algorithm: "sm2" | "fsrs";
  initialEaseFactor: number;
  minimumEaseFactor: number;
  maxIntervalDays: number;
  learningSteps: number[];
  relearningSteps: number[];
}): StudySrsScheduleSettings {
  return {
    algorithm: settings.algorithm,
    initialEaseFactor: settings.initialEaseFactor,
    minimumEaseFactor: settings.minimumEaseFactor,
    maxIntervalDays: settings.maxIntervalDays,
    learningSteps: settings.learningSteps,
    relearningSteps: settings.relearningSteps,
  };
}

async function buildSessionState(session: StudySessionWithDeck): Promise<StudySessionState> {
  const queue = await loadPendingQueue(session.id);
  const [cards, settings] = await Promise.all([
    loadSessionCards(queue.map((item) => item.cardId)),
    loadSrsScheduleSettings(session.userId),
  ]);

  return {
    session: toStudySessionView(session, await loadPendingCounts(session.id)),
    cards,
    queue,
    srsSettings: toSrsSettingsView(settings),
  };
}

/* ------------------------------------------------------------------------- */
/* RF-001 / RF-002 / RF-003 / RF-017 / RF-022: iniciar una sesión               */
/* ------------------------------------------------------------------------- */

/** Mazos a los que aplica la sesión: el elegido con sus sub-mazos, o todos (RF-001). */
async function resolveDeckScope(
  userId: string,
  deckId: string | null,
  includeSubdecks: boolean
): Promise<string[]> {
  const rows = await prisma.deck.findMany({
    where: { userId },
    select: { id: true, parentDeckId: true },
  });

  if (rows.length === 0) {
    throw new Error("Crea un mazo y añade tarjetas antes de estudiar");
  }

  if (!deckId) {
    return rows.map((row) => row.id);
  }

  if (!rows.some((row) => row.id === deckId)) {
    throw new Error("El mazo no existe");
  }

  return includeSubdecks ? [...collectDeckBranchIds(rows, deckId)] : [deckId];
}

/**
 * Cierra las sesiones que quedaron abiertas (RF-021). Al empezar una nueva solo
 * puede quedar una abierta, así que las anteriores se marcan como finalizadas
 * para que el historial no acumule sesiones a medias que el usuario ya no puede
 * recuperar. Reanudar una de ellas sigue siendo posible desde su propia URL.
 */
async function closeOpenSessions(userId: string, now: Date): Promise<void> {
  const open = await prisma.studySession.findMany({
    where: { userId, status: { in: ["active", "paused"] } },
    select: { id: true, startedAt: true, pausedAt: true, elapsedMs: true },
  });

  for (const session of open) {
    await prisma.studySession.update({
      where: { id: session.id },
      data: {
        status: "completed",
        isCompleted: true,
        endedAt: now,
        elapsedMs: session.elapsedMs + elapsedSince(session.startedAt, session.pausedAt, now),
      },
    });
  }
}

export async function startStudySession(
  userId: string,
  input: StudyStartInput
): Promise<StudyStartResult> {
  const now = new Date();
  const maxCards = input.maxCards ?? DEFAULT_STUDY_MAX_CARDS;
  const [deckIds, limits] = await Promise.all([
    resolveDeckScope(userId, input.deckId, input.includeSubdecks),
    resolveStudyLimits(userId, now),
  ]);

  const candidates = await loadCandidates({
    userId,
    deckIds,
    // El modo cram (RF-022) ignora las fechas; el estudio anticipado (RF-017)
    // amplía la ventana de vencimiento en lugar de saltársela.
    window: input.isCramMode ? null : dueWindow(now, input.earlyDays),
    take: candidateReadLimit(maxCards, limits, input.isCramMode),
  });

  const limited = limitQueue(candidates, { ...limits, maxCards }, {
    ignoreDailyLimits: input.isCramMode,
  });

  const srsSettings = toSrsSettingsView(await loadSrsScheduleSettings(userId));

  // RF-004: sin tarjetas que estudiar no se crea sesión. Así una sesión abandonada
  // con cero respuestas no ensucia el historial, y una sesión en pausa sigue
  // disponible para reanudarla.
  if (limited.accepted.length === 0) {
    return { session: null, cards: [], queue: [], srsSettings, isEmpty: true };
  }

  await closeOpenSessions(userId, now);

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.studySession.create({
      data: {
        userId,
        deckId: input.deckId,
        isCramMode: input.isCramMode,
        earlyDays: input.earlyDays,
      },
      select: studySessionSelect,
    });

    await tx.studySessionCard.createMany({
      data: limited.accepted.map((candidate, index) => ({
        sessionId: created.id,
        cardId: candidate.cardId,
        position: index,
      })),
    });

    return created;
  });

  const acceptedIds = limited.accepted.map((candidate) => candidate.cardId);

  return {
    session: toStudySessionView(session, limited.counts),
    cards: await loadSessionCards(acceptedIds),
    queue: limited.accepted.map((candidate) => toQueueItem(candidate.cardId, candidate.status)),
    srsSettings,
    isEmpty: false,
  };
}

/* ------------------------------------------------------------------------- */
/* RF-020 / RF-021: retomar una sesión                                         */
/* ------------------------------------------------------------------------- */

export async function getStudySession(
  userId: string,
  sessionId: string
): Promise<StudySessionState> {
  const session = await getOwnedSession(userId, sessionId);

  if (session.isCompleted) {
    throw new Error("Esta sesión de estudio ya ha terminado");
  }

  return buildSessionState(session);
}

/** Sesión activa o en pausa más reciente, para ofrecer "Reanudar" (RF-020, RF-021). */
export async function getResumableSession(userId: string): Promise<StudyResumable> {
  const session = await prisma.studySession.findFirst({
    where: { userId, isCompleted: false, status: { in: ["active", "paused"] } },
    orderBy: { startedAt: "desc" },
    select: studySessionSelect,
  });

  if (!session) {
    return null;
  }

  return {
    session: toStudySessionView(session, await loadPendingCounts(session.id)),
    pendingCards: await prisma.studySessionCard.count({
      where: { sessionId: session.id, rating: null },
    }),
  };
}

/* ------------------------------------------------------------------------- */
/* RF-019: pausar, congelar el tiempo y reanudar                               */
/* ------------------------------------------------------------------------- */

/**
 * Tiempo transcurrido desde el último arranque (`started_at` o el `paused_at`
 * anterior). Al pausar se suma a `elapsed_ms` y al reanudar el contador vuelve a
 * cero, de forma que una pausa larga no infla el tiempo de estudio (RF-014).
 */
function elapsedSince(startedAt: Date, pausedAt: Date | null, now: Date): number {
  const diff = now.getTime() - (pausedAt ?? startedAt).getTime();

  return diff > 0 ? diff : 0;
}

export async function pauseStudySession(
  userId: string,
  input: { sessionId: string; cardId?: string }
): Promise<StudyPauseResult> {
  const now = new Date();
  const current = await getOwnedSession(userId, input.sessionId);

  if (current.isCompleted) {
    throw new Error("Esta sesión de estudio ya ha terminado");
  }

  const paused = await prisma.studySession.update({
    where: { id: current.id },
    data: {
      status: "paused",
      pausedAt: now,
      // RF-019: la tarjeta visible es la que se recupera al reanudar.
      currentCardId: input.cardId ?? null,
      elapsedMs: current.elapsedMs + elapsedSince(current.startedAt, current.pausedAt, now),
    },
    select: studySessionSelect,
  });

  return { session: toStudySessionView(paused, await loadPendingCounts(paused.id)) };
}

export async function resumeStudySession(
  userId: string,
  input: { sessionId: string }
): Promise<StudySessionState> {
  const current = await getOwnedSession(userId, input.sessionId);

  if (current.isCompleted) {
    throw new Error("Esta sesión de estudio ya ha terminado");
  }

  const resumed = await prisma.studySession.update({
    where: { id: current.id },
    data: { status: "active", pausedAt: null },
    select: studySessionSelect,
  });

  const state = await buildSessionState(resumed);

  // RF-019: la tarjeta que estaba en pantalla vuelve a ser la primera de la cola
  // para que el usuario la retome exactamente donde la dejó.
  if (resumed.currentCardId) {
    state.queue = [
      ...state.queue.filter((item) => item.cardId === resumed.currentCardId),
      ...state.queue.filter((item) => item.cardId !== resumed.currentCardId),
    ];
    state.cards = [
      ...state.cards.filter((card) => card.id === resumed.currentCardId),
      ...state.cards.filter((card) => card.id !== resumed.currentCardId),
    ];
  }

  return state;
}

/* ------------------------------------------------------------------------- */
/* RF-013 / RF-015 / RF-023: calificar una tarjeta                             */
/* ------------------------------------------------------------------------- */

export async function reviewStudyCard(
  userId: string,
  input: { sessionId: string; cardId: string; rating: SrsRating; timeSpentMs?: number }
): Promise<StudyReviewResult> {
  const now = new Date();
  const timeSpentMs = input.timeSpentMs ?? 0;
  const session = await getOwnedSession(userId, input.sessionId);

  if (session.isCompleted) {
    throw new Error("Esta sesión de estudio ya ha terminado");
  }

  if (session.status === "paused") {
    throw new Error("Reanuda la sesión para poder calificar");
  }

  const entry = await prisma.studySessionCard.findUnique({
    where: { sessionId_cardId: { sessionId: session.id, cardId: input.cardId } },
    select: { card: { select: { scheduling: { select: { status: true } } } } },
  });

  if (!entry) {
    throw new Error("Esta tarjeta no pertenece a la sesión");
  }

  // RF-023: el modo cram es solo práctica, así que no toca el scheduling, no
  // escribe historial de repasos y tampoco consume la cuota diaria.
  const applied = await prisma.$transaction(async (tx) => {
    let intervalLabel = "Sin efecto";
    let nextDueAt: Date | null = null;
    let status = entry.card.scheduling?.status ?? "new";

    if (!session.isCramMode) {
      const result = await applySrsReview({
        userId,
        cardId: input.cardId,
        rating: input.rating,
        timeSpentMs,
        client: tx,
        now,
      });

      intervalLabel = result.intervalLabel;
      status = result.status;

      // La tarjeta vuelve a la cola de la sesión solo si el planificador la
      // reprograma para dentro del mismo día (pasos de aprendizaje).
      if (
        (result.status === "learning" || result.status === "relearning") &&
        result.delayMinutes > 0
      ) {
        nextDueAt = new Date(now.getTime() + result.delayMinutes * 60_000);
      }

      await bumpDailyStats(tx, userId, input.rating, result.previousStatus, timeSpentMs, now);
    }

    await tx.studySessionCard.update({
      where: { sessionId_cardId: { sessionId: session.id, cardId: input.cardId } },
      data: {
        rating: input.rating,
        reviewedAt: now,
        timeSpentMs: { increment: timeSpentMs },
      },
    });

    await tx.studySession.update({
      where: { id: session.id },
      data: {
        totalCards: { increment: 1 },
        totalTimeSpentMs: { increment: timeSpentMs },
        [STUDY_RATING_COUNTER_FIELD[input.rating]]: { increment: 1 },
      },
    });

    return { intervalLabel, nextDueAt, status };
  });

  const [counts, updated] = await Promise.all([
    loadPendingCounts(session.id),
    prisma.studySession.findUniqueOrThrow({
      where: { id: session.id },
      select: studySessionSelect,
    }),
  ]);

  return {
    cardId: input.cardId,
    rating: input.rating,
    status: applied.status as StudyReviewResult["status"],
    intervalLabel: applied.intervalLabel,
    nextDueAt: applied.nextDueAt ? applied.nextDueAt.toISOString() : null,
    isCramMode: session.isCramMode,
    counts,
    isFinished: counts.remaining === 0,
    elapsedMs: updated.elapsedMs + elapsedSince(updated.startedAt, updated.pausedAt, now),
  };
}

/**
 * Acumula la respuesta del día en `daily_study_stats` (RF-003). Se hace dentro de la
 * transacción de la calificación para que los límites del día siguiente nunca se
 * calculen con un dato a medias.
 */
async function bumpDailyStats(
  tx: Prisma.TransactionClient,
  userId: string,
  rating: SrsRating,
  previousStatus: string,
  timeSpentMs: number,
  now: Date
): Promise<void> {
  const isNew = previousStatus === "new";
  const ratingField = STUDY_RATING_COUNTER_FIELD[rating];

  await tx.dailyStudyStats.upsert({
    where: { userId_studyDate: { userId, studyDate: today(now) } },
    create: {
      userId,
      studyDate: today(now),
      totalCards: 1,
      newCards: isNew ? 1 : 0,
      reviewCards: isNew ? 0 : 1,
      totalTimeSpentMs: timeSpentMs,
      [ratingField]: 1,
    },
    update: {
      totalCards: { increment: 1 },
      newCards: { increment: isNew ? 1 : 0 },
      reviewCards: { increment: isNew ? 0 : 1 },
      totalTimeSpentMs: { increment: timeSpentMs },
      [ratingField]: { increment: 1 },
    },
  });
}

/* ------------------------------------------------------------------------- */
/* RF-015 / RF-016: resumen de la sesión                                      */
/* ------------------------------------------------------------------------- */

function buildSummary(session: StudySessionWithDeck, counts: StudyQueueCounts): StudySummary {
  return {
    session: toStudySessionView(session, counts),
    breakdown: [
      { rating: "again", count: session.againCount },
      { rating: "hard", count: session.hardCount },
      { rating: "good", count: session.goodCount },
      { rating: "easy", count: session.easyCount },
    ],
    accuracy: toAccuracy(
      session.againCount,
      session.hardCount,
      session.goodCount,
      session.easyCount
    ),
    durationMs: session.elapsedMs,
    averageMsPerCard:
      session.totalCards > 0 ? Math.round(session.elapsedMs / session.totalCards) : 0,
  };
}

export async function completeStudySession(
  userId: string,
  input: { sessionId: string }
): Promise<StudySummary> {
  const now = new Date();
  const current = await getOwnedSession(userId, input.sessionId);

  const completed = await prisma.studySession.update({
    where: { id: current.id },
    data: {
      status: "completed",
      isCompleted: true,
      endedAt: current.endedAt ?? now,
      elapsedMs: current.elapsedMs + elapsedSince(current.startedAt, current.pausedAt, now),
      currentCardId: null,
    },
    select: studySessionSelect,
  });

  return buildSummary(completed, await loadPendingCounts(completed.id));
}

export async function getStudySummary(
  userId: string,
  input: { sessionId: string }
): Promise<StudySummary> {
  const session = await getOwnedSession(userId, input.sessionId);

  return buildSummary(session, await loadPendingCounts(session.id));
}

/* ------------------------------------------------------------------------- */
/* Panel de estudio: qué hay pendiente y qué se puede reanudar                */
/* ------------------------------------------------------------------------- */

/**
 * Recuento de tarjetas pendientes por mazo (RF-002) y por cubo (RF-012).
 *
 * Los cubos se calculan sin aplicar los límites diarios: el panel informa de lo que
 * hay, no de lo que se puede introducir hoy.
 */
export async function getStudyOverview(
  userId: string,
  input: { deckId?: string | null }
): Promise<StudyOverview> {
  const now = new Date();
  const limits = await resolveStudyLimits(userId, now);
  const resumable = await getResumableSession(userId);

  const decks = await prisma.deck.findMany({
    where: { userId },
    select: { id: true, name: true, slug: true, parentDeckId: true, isArchived: true },
  });

  if (decks.length === 0) {
    return {
      allDecks: { new: 0, learning: 0, review: 0, remaining: 0, upcoming: 0, totalCards: 0 },
      decks: [],
      limits,
      resumable,
    };
  }

  const dueLimit = endOfUtcDay(now);
  const upcomingLimit = endOfUtcDay(addUtcDays(now, UPCOMING_WINDOW_DAYS));

  const rows = await prisma.card.findMany({
    where: { userId, isSuspended: false },
    select: { deckId: true, scheduling: { select: { status: true, dueDate: true } } },
  });

  // Cada tarjeta se clasifica una sola vez y luego se agrega por mazo y por ámbito,
  // para que los contadores del panel y los de "Todos los mazos" no puedan divergir.
  const classified = rows.flatMap((row) => {
    if (!row.scheduling) {
      return [];
    }

    const { status, dueDate } = row.scheduling;
    // Una tarjeta nueva siempre está disponible: su `due_date` es la de creación.
    const isDue = status === "new" || dueDate <= dueLimit;

    return [
      {
        deckId: row.deckId,
        status,
        isDue,
        /** Vence dentro de la ventana de anticipación pero no hoy (RF-017). */
        isUpcoming: !isDue && dueDate <= upcomingLimit,
      },
    ];
  });

  const depths = computeDeckDepths(decks);
  const perDeck = new Map<string, { due: string[]; upcoming: number; total: number }>();

  for (const deck of decks) {
    perDeck.set(deck.id, { due: [], upcoming: 0, total: 0 });
  }

  for (const row of classified) {
    const bucket = perDeck.get(row.deckId);

    if (!bucket) {
      continue;
    }

    bucket.total += 1;
    bucket.upcoming += row.isUpcoming ? 1 : 0;

    if (row.isDue) {
      bucket.due.push(row.status);
    }
  }

  const options: StudyDeckOption[] = decks
    .map((deck) => {
      const bucket = perDeck.get(deck.id) as { due: string[]; upcoming: number; total: number };

      return {
        id: deck.id,
        name: deck.name,
        slug: deck.slug,
        depth: depths.get(deck.id) ?? 1,
        isArchived: deck.isArchived,
        counts: countBuckets(bucket.due),
        upcoming: bucket.upcoming,
      };
    })
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name, "es"));

  // Con mazo seleccionado, el bloque "Todos los mazos" se restringe a su rama para
  // que la pantalla de inicio y el contador grande no se contradigan.
  const scopeIds =
    input.deckId && perDeck.has(input.deckId)
      ? [...collectDeckBranchIds(decks, input.deckId)]
      : decks.map((deck) => deck.id);

  const inScope = classified.filter((row) => scopeIds.includes(row.deckId));

  return {
    allDecks: {
      ...countBuckets(inScope.filter((row) => row.isDue).map((row) => row.status)),
      upcoming: inScope.filter((row) => row.isUpcoming).length,
      totalCards: inScope.length,
    },
    decks: options,
    limits,
    resumable,
  };
}

/* ------------------------------------------------------------------------- */
/* Historial y estadísticas                                                   */
/* ------------------------------------------------------------------------- */

export async function getStudyHistory(
  userId: string,
  input: { page: number; pageSize: number }
): Promise<StudyHistoryResult> {
  const where = { userId, isCompleted: true } satisfies Prisma.StudySessionWhereInput;

  const [rows, totalSessions, totals] = await Promise.all([
    prisma.studySession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: studySessionSelect,
    }),
    prisma.studySession.count({ where }),
    prisma.studySession.aggregate({
      where,
      _sum: {
        totalCards: true,
        totalTimeSpentMs: true,
        againCount: true,
        hardCount: true,
        goodCount: true,
        easyCount: true,
      },
    }),
  ]);

  return {
    sessions: rows.map((row) => toStudyHistoryEntry(row)),
    page: input.page,
    pageSize: input.pageSize,
    totalSessions,
    totalPages: Math.max(1, Math.ceil(totalSessions / input.pageSize)),
    totals: {
      totalCards: totals._sum.totalCards ?? 0,
      durationMs: totals._sum.totalTimeSpentMs ?? 0,
      // La precisión agregada se pondera por respuestas, no por sesiones.
      accuracy: toAccuracy(
        totals._sum.againCount ?? 0,
        totals._sum.hardCount ?? 0,
        totals._sum.goodCount ?? 0,
        totals._sum.easyCount ?? 0
      ),
    },
  };
}

export async function getDailyStudyStats(
  userId: string,
  input: { days: number }
): Promise<StudyDailyStatsResult> {
  const now = new Date();
  const from = addUtcDays(today(now), -(input.days - 1));

  const rows = await prisma.dailyStudyStats.findMany({
    where: { userId, studyDate: { gte: from } },
    orderBy: { studyDate: "asc" },
  });

  // La serie se devuelve densa: los días sin actividad se incluyen con ceros para que
  // el gráfico del historial no tenga huecos que interpretarse como datos perdidos.
  const rowsByDay = new Map(rows.map((row) => [toIsoDay(row.studyDate), row]));
  const days: StudyDailyStatEntry[] = [];

  for (let offset = 0; offset < input.days; offset += 1) {
    const date = addUtcDays(from, offset);
    const row = rowsByDay.get(toIsoDay(date));

    days.push(
      row
        ? toStudyDailyStatEntry(row)
        : {
            studyDate: toIsoDay(date),
            totalCards: 0,
            newCards: 0,
            reviewCards: 0,
            totalTimeSpentMs: 0,
            againCount: 0,
            hardCount: 0,
            goodCount: 0,
            easyCount: 0,
            accuracy: 0,
          }
    );
  }

  const totals = days.reduce(
    (accumulator, day) => ({
      totalCards: accumulator.totalCards + day.totalCards,
      newCards: accumulator.newCards + day.newCards,
      reviewCards: accumulator.reviewCards + day.reviewCards,
      totalTimeSpentMs: accumulator.totalTimeSpentMs + day.totalTimeSpentMs,
      accuracySum: accumulator.accuracySum + day.accuracy * day.totalCards,
    }),
    { totalCards: 0, newCards: 0, reviewCards: 0, totalTimeSpentMs: 0, accuracySum: 0 }
  );

  return {
    days,
    totals: {
      totalCards: totals.totalCards,
      newCards: totals.newCards,
      reviewCards: totals.reviewCards,
      totalTimeSpentMs: totals.totalTimeSpentMs,
      accuracy:
        totals.totalCards > 0
          ? Math.round((totals.accuracySum / totals.totalCards) * 10) / 10
          : 0,
    },
    currentStreak: computeStreak(
      rows.map((row) => toIsoDay(row.studyDate)),
      today(now)
    ),
  };
}

/** Días consecutivos con al menos una respuesta, contando desde hoy hacia atrás. */
function computeStreak(studiedDates: string[], todayDate: Date): number {
  const studied = new Set(studiedDates);
  // Si hoy todavía no se ha estudiado, la racha se cuenta desde ayer: el día en
  // curso sigue siendo recuperable.
  let cursor = studied.has(toIsoDay(todayDate)) ? todayDate : addUtcDays(todayDate, -1);
  let streak = 0;

  while (studied.has(toIsoDay(cursor))) {
    streak += 1;
    cursor = addUtcDays(cursor, -1);
  }

  return streak;
}

/* ------------------------------------------------------------------------- */
/* Handlers de oRPC                                                          */
/* ------------------------------------------------------------------------- */

/**
 * Los handlers viven fuera de los procedimientos para poder invocarlos desde
 * comprobaciones sin levantar el middleware de autenticación, que necesita el
 * contexto de petición de Next.js. Los procedimientos solo inyectan el `userId`.
 */
export const studyRouter = {
  /** POST /api/study/start — RF-001, RF-002, RF-003, RF-017, RF-022. */
  start: protectedProcedure
    .input(studyStartInputSchema)
    .handler(async ({ input, context }): Promise<StudyStartResult> =>
      startStudySession(context.user.id, input)
    ),

  /** GET /api/study/session/[id] — estado de una sesión activa o en pausa (RF-020). */
  getSession: protectedProcedure
    .input(studySessionInputSchema)
    .handler(async ({ input, context }): Promise<StudySessionState> =>
      getStudySession(context.user.id, input.sessionId)
    ),

  /** Sesión abierta más reciente, para el botón "Reanudar" del panel (RF-021). */
  resumable: protectedProcedure.handler(
    async ({ context }): Promise<{ resumable: StudyResumable }> => ({
      resumable: await getResumableSession(context.user.id),
    })
  ),

  /** GET /api/study/due?deck_id=[id] — qué hay pendiente y con qué límites (RF-003). */
  overview: protectedProcedure
    .input(studyOverviewInputSchema)
    .handler(async ({ input, context }): Promise<StudyOverview> =>
      getStudyOverview(context.user.id, input)
    ),

  /** POST /api/study/session/[id]/review — califica la tarjeta visible (RF-013, RF-023). */
  review: protectedProcedure
    .input(studyReviewInputSchema)
    .handler(async ({ input, context }): Promise<StudyReviewResult> =>
      reviewStudyCard(context.user.id, input)
    ),

  /** POST /api/study/session/[id]/pause — RF-019. */
  pause: protectedProcedure
    .input(studyPauseInputSchema)
    .handler(async ({ input, context }): Promise<StudyPauseResult> =>
      pauseStudySession(context.user.id, input)
    ),

  /** POST /api/study/session/[id]/resume — RF-020. */
  resume: protectedProcedure
    .input(studySessionInputSchema)
    .handler(async ({ input, context }): Promise<StudySessionState> =>
      resumeStudySession(context.user.id, input)
    ),

  /** POST /api/study/session/[id]/complete — cierra la sesión (RF-015). */
  complete: protectedProcedure
    .input(studyCompleteInputSchema)
    .handler(async ({ input, context }): Promise<StudySummary> =>
      completeStudySession(context.user.id, input)
    ),

  /** Resumen de una sesión ya cerrada, para la pantalla `/study/summary`. */
  summary: protectedProcedure
    .input(studyCompleteInputSchema)
    .handler(async ({ input, context }): Promise<StudySummary> =>
      getStudySummary(context.user.id, input)
    ),

  /** GET /api/study/history — historial de sesiones finalizadas. */
  history: protectedProcedure
    .input(studyHistoryInputSchema)
    .handler(async ({ input, context }): Promise<StudyHistoryResult> =>
      getStudyHistory(context.user.id, input)
    ),

  /** GET /api/study/stats/daily — estadísticas agregadas del día, para el panel. */
  dailyStats: protectedProcedure
    .input(studyDailyStatsInputSchema)
    .handler(async ({ input, context }): Promise<StudyDailyStatsResult> =>
      getDailyStudyStats(context.user.id, input)
    ),
};

export type StudyRouter = typeof studyRouter;