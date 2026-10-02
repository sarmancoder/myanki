import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { protectedProcedure } from "@/server/procedures";
import { applySrsReview, loadSrsScheduleSettings } from "@/lib/srs/apply";
import { collectDeckBranchIds, computeDeckDepths } from "@/lib/decks/tree";
import { addUtcDays, startOfUtcDay } from "@/lib/srs/dates";
import {
  STUDY_CRAM_INTERVAL_LABEL,
  STUDY_MAX_BATCH_ANSWERS,
  STUDY_RATING_COUNTER_FIELD,
} from "@/constants/study";
import type { SrsRating } from "@/constants/srs";
import { countBuckets, orderStudyQueue, toAccuracy, type StudyQueueCandidate } from "@/lib/study/queue";
import {
  studyCardSelect,
  studyDeckCardSelect,
  studySessionSelect,
  toQueueItem,
  toStudyCardView,
  toStudyDailyStatEntry,
  toStudyDeckCardView,
  toStudyHistoryEntry,
  toStudySessionView,
  type StudySessionWithDeck,
} from "@/lib/study/serialize";
import {
  studyCompleteInputSchema,
  studyDailyStatsInputSchema,
  studyDeckCardsInputSchema,
  studyHistoryInputSchema,
  studyOverviewInputSchema,
  studyPauseInputSchema,
  studyReviewBatchInputSchema,
  studyReviewInputSchema,
  studySessionInputSchema,
  studyStartInputSchema,
  type StudyStartInput,
} from "@/lib/validation/study";
import type {
  StudyAnswerDraft,
  StudyQueueCounts,
  StudyResumable,
  StudyReviewBatchResult,
  StudySrsScheduleSettings,
} from "@/types/study";
import { ensureUserLanguages } from "@/server/languages";
import type {
  StudyDailyStatEntry,
  StudyDailyStatsResult,
  StudyDeckCardsResult,
  StudyDeckOption,
  StudyHistoryResult,
  StudyLanguageFilter,
  StudyOverview,
  StudyPauseResult,
  StudyReviewResult,
  StudySessionState,
  StudyStartResult,
  StudySummary,
} from "@/types/study";

/* ------------------------------------------------------------------------- */
/* Utilidades de fecha y contadores del día                                    */
/* ------------------------------------------------------------------------- */

/** Inicio del día en UTC: `daily_study_stats.study_date` es una columna DATE. */
function today(now: Date): Date {
  return startOfUtcDay(now);
}

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------------- */
/* Selección de tarjetas                                                       */
/* ------------------------------------------------------------------------- */

const candidateSelect = {
  id: true,
  scheduling: {
    select: {
      status: true,
      repetitions: true,
      lapses: true,
    },
  },
} satisfies Prisma.CardSelect;

type CandidateRow = Prisma.CardGetPayload<{ select: typeof candidateSelect }>;

/**
 * Tarjetas candidatas a entrar en la cola: todas las no suspendidas del ámbito
 * elegido, sin filtro de vencimiento ni cupo diario. El usuario puede estudiar el
 * mazo tantas veces como quiera, así que la cola no se recorta: lo único que se
 * excluye son las tarjetas sin scheduling, que no se pueden calificar.
 */
async function loadCandidates(options: {
  userId: string;
  deckIds: string[];
}): Promise<StudyQueueCandidate[]> {
  const rows: CandidateRow[] = await prisma.card.findMany({
    where: {
      userId: options.userId,
      isSuspended: false,
      deckId: { in: options.deckIds },
      scheduling: { isNot: null },
    },
    select: candidateSelect,
  });

  return rows.flatMap((row) =>
    row.scheduling
      ? [
          {
            cardId: row.id,
            status: row.scheduling.status as StudyQueueCandidate["status"],
            // Repeticiones + lapsos = veces reales que se ha estudiado la tarjeta.
            studyCount: row.scheduling.repetitions + row.scheduling.lapses,
          },
        ]
      : []
  );
}

/** Tarjetas del mazo con su estado, para el listado de la pantalla de estudio. */
type DeckCardRow = Prisma.CardGetPayload<{ select: typeof studyDeckCardSelect }>;

/**
 * Listado completo de tarjetas de un mazo (RF-024): el usuario elige el mazo en
 * el panel de estudio y aquí ve todo lo que contiene antes de empezar.
 */
export async function getStudyDeckCards(
  userId: string,
  input: { deckId: string }
): Promise<StudyDeckCardsResult> {
  const deck = await prisma.deck.findFirst({
    where: { id: input.deckId, userId },
    select: { id: true },
  });

  if (!deck) {
    throw new Error("El mazo no existe");
  }

  const rows: DeckCardRow[] = await prisma.card.findMany({
    where: { userId, deckId: input.deckId },
    select: studyDeckCardSelect,
    // El orden lo fija el índice por mazo de `cards`; el listado es informativo.
    orderBy: { createdAt: "asc" },
  });

  const cards = rows.flatMap((row) => {
    const view = toStudyDeckCardView(row);

    return view ? [view] : [];
  });

  const tree = await prisma.deck.findMany({
    where: { userId },
    select: { id: true, parentDeckId: true },
  });

  const branchIds = [...collectDeckBranchIds(tree, input.deckId)];
  const branchTotalCards = await prisma.card.count({
    where: { userId, deckId: { in: branchIds }, isSuspended: false },
  });

  return {
    cards,
    counts: countBuckets(cards.filter((card) => !card.isSuspended).map((card) => card.status)),
    branchTotalCards,
    subDeckCount: Math.max(0, branchIds.length - 1),
  };
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
/* RF-001 / RF-002 / RF-024: iniciar una sesión                                */
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

/**
 * Arranca una sesión de estudio sobre el mazo elegido (RF-001).
 *
 * La cola son todas las tarjetas no suspendidas del ámbito, ordenadas por las que
 * menos se han estudiado. No hay cupos ni tope por sesión: se puede repetir el
 * mazo tantas veces como se quiera y cada sesión sale con un orden distinto.
 */
export async function startStudySession(
  userId: string,
  input: StudyStartInput
): Promise<StudyStartResult> {
  const now = new Date();
  const deckIds = await resolveDeckScope(userId, input.deckId, input.includeSubdecks);

  const candidates = await loadCandidates({ userId, deckIds });
  const queue = orderStudyQueue(candidates);
  const counts = countBuckets(queue.map((candidate) => candidate.status));

  const srsSettings = toSrsSettingsView(await loadSrsScheduleSettings(userId));

  // RF-004: sin tarjetas que estudiar no se crea sesión. Así una sesión abandonada
  // con cero respuestas no ensucia el historial, y una sesión en pausa sigue
  // disponible para reanudarla.
  if (queue.length === 0) {
    return { session: null, cards: [], queue: [], srsSettings, isEmpty: true };
  }

  await closeOpenSessions(userId, now);

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.studySession.create({
      data: {
        userId,
        deckId: input.deckId,
        isCramMode: input.isCramMode,
      },
      select: studySessionSelect,
    });

    await tx.studySessionCard.createMany({
      data: queue.map((candidate, index) => ({
        sessionId: created.id,
        cardId: candidate.cardId,
        position: index,
      })),
    });

    return created;
  });

  const acceptedIds = queue.map((candidate) => candidate.cardId);

  return {
    session: toStudySessionView(session, counts),
    cards: await loadSessionCards(acceptedIds),
    queue: queue.map((candidate) => toQueueItem(candidate.cardId, candidate.status)),
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
    let intervalLabel = STUDY_CRAM_INTERVAL_LABEL;
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
 * Lote de calificaciones de una sesión (RF-013).
 *
 * La interfaz de estudio calcula el SRS en el navegador, así que calificar no
 * cuesta ninguna ida al servidor: las respuestas se acumulan y se envían todas
 * juntas cuando se recorre la cola. Aquí se aplican en una única transacción.
 *
 * El envío es idempotente gracias a `applied_answer_keys`: cada respuesta lleva una
 * clave estable que el cliente conserva entre reintentos, y las que ya están
 * guardadas se descartan. Así un envío que llegó al servidor pero cuya respuesta se
 * perdió puede repetirse sin contar las tarjetas dos veces.
 */
export async function reviewStudyCardsBatch(
  userId: string,
  input: { sessionId: string; answers: StudyAnswerDraft[] }
): Promise<StudyReviewBatchResult> {
  const now = new Date();
  const session = await getOwnedSession(userId, input.sessionId);

  if (session.isCompleted) {
    throw new Error("Esta sesión de estudio ya ha terminado");
  }

  const appliedKeys = readAppliedAnswerKeys(session.appliedAnswerKeys);
  const answers = input.answers.slice(0, STUDY_MAX_BATCH_ANSWERS);

  // Solo se procesa lo que el servidor no tiene guardado. `seenKeys` es el conjunto
  // de trabajo para descartar repeticiones dentro del propio lote; lo que de verdad
  // está guardado es `appliedKeys` más lo que se escriba en la transacción.
  const seenKeys = new Set(appliedKeys);
  const fresh: StudyAnswerDraft[] = [];

  for (const answer of answers) {
    if (seenKeys.has(answer.key)) {
      continue;
    }

    seenKeys.add(answer.key);
    fresh.push(answer);
  }

  if (fresh.length === 0) {
    return {
      savedKeys: answers.map((answer) => answer.key),
      applied: 0,
      skipped: answers.length,
      counts: await loadPendingCounts(session.id),
    };
  }

  const cardIds = [...new Set(fresh.map((answer) => answer.cardId))];
  // La configuración se resuelve una vez para todo el lote: releerla por tarjeta
  // multiplicaría las consultas sin cambiar el resultado.
  const settings = await loadSrsScheduleSettings(userId);

  const sessionStartMs = session.startedAt.getTime();

  const result = await prisma.$transaction(async (tx) => {
    // Una tarjeta borrada a mitad de sesión ya no está en la cola: sus respuestas
    // se descartan en lugar de romper el lote entero.
    const inSession = new Set(
      (
        await tx.studySessionCard.findMany({
          where: { sessionId: session.id, cardId: { in: cardIds } },
          select: { cardId: true },
        })
      ).map((row) => row.cardId)
    );

    const dailyStats = new Map<string, DailyStatsAccumulator>();
    const savedKeys: string[] = [];
    const totals = {
      cards: 0,
      timeSpentMs: 0,
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    };

    for (const answer of fresh) {
      if (!inSession.has(answer.cardId)) {
        continue;
      }

      const reviewedAt = clampReviewedAt(answer.reviewedAt, sessionStartMs, now);

      // RF-023: el modo cram es solo práctica, así que no toca el scheduling, no
      // escribe historial de repasos y tampoco consume la cuota diaria.
      if (!session.isCramMode) {
        const appliedReview = await applySrsReview({
          userId,
          cardId: answer.cardId,
          rating: answer.rating,
          timeSpentMs: answer.timeSpentMs,
          client: tx,
          settings,
          now: reviewedAt,
        });

        accumulateDailyStats(
          dailyStats,
          answer.rating,
          appliedReview.previousStatus,
          answer.timeSpentMs,
          reviewedAt
        );
      }

      await tx.studySessionCard.update({
        where: { sessionId_cardId: { sessionId: session.id, cardId: answer.cardId } },
        data: {
          rating: answer.rating,
          reviewedAt,
          timeSpentMs: { increment: answer.timeSpentMs },
        },
      });

      totals.cards += 1;
      totals.timeSpentMs += answer.timeSpentMs;
      totals[answer.rating] += 1;
      savedKeys.push(answer.key);
    }

    if (totals.cards > 0) {
      await tx.studySession.update({
        where: { id: session.id },
        data: {
          totalCards: { increment: totals.cards },
          totalTimeSpentMs: { increment: totals.timeSpentMs },
          againCount: { increment: totals.again },
          hardCount: { increment: totals.hard },
          goodCount: { increment: totals.good },
          easyCount: { increment: totals.easy },
          appliedAnswerKeys: [...appliedKeys, ...savedKeys],
        },
      });
    }

    for (const bucket of dailyStats.values()) {
      await writeDailyStats(tx, userId, bucket);
    }

    return { applied: totals.cards, savedKeys };
  });

  const counts = await loadPendingCounts(session.id);
  const savedKeys = new Set([...appliedKeys, ...result.savedKeys]);

  return {
    // Se confirman todas las respuestas del lote que la base de datos tiene
    // guardadas, no solo las de esta llamada: el cliente marca como resueltas
    // exactamente esas y solo reenvía lo que falte.
    savedKeys: answers.filter((answer) => savedKeys.has(answer.key)).map((answer) => answer.key),
    applied: result.applied,
    skipped: answers.length - result.applied,
    counts,
  };
}

/** Lee `applied_answer_keys` tolerando cualquier valor que haya en la columna. */
function readAppliedAnswerKeys(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [];
}

/**
 * Acota la fecha que envía el cliente: no puede ser anterior al arranque de la
 * sesión (el reloj del cliente puede ir atrasado) ni posterior al momento en que
 * llega el lote.
 */
function clampReviewedAt(value: string, sessionStartMs: number, now: Date): Date {
  const parsed = new Date(value);
  const ms = Number.isNaN(parsed.getTime()) ? now.getTime() : parsed.getTime();

  return new Date(Math.min(Math.max(ms, sessionStartMs), now.getTime()));
}
/**
 * Acumula las respuestas del día en `daily_study_stats` (RF-003). Se hace dentro de
 * la transacción de la calificación para que los límites del día siguiente nunca se
 * calculen con un dato a medias.
 *
 * Una sesión puede cruzar la medianoche, así que el lote agrupa por día en vez de
 * escribir todas las respuestas en la fecha en la que llega el envío.
 */
interface DailyStatsAccumulator {
  studyDate: Date;
  totalCards: number;
  newCards: number;
  reviewCards: number;
  totalTimeSpentMs: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
}

function emptyDailyStatsAccumulator(studyDate: Date): DailyStatsAccumulator {
  return {
    studyDate,
    totalCards: 0,
    newCards: 0,
    reviewCards: 0,
    totalTimeSpentMs: 0,
    againCount: 0,
    hardCount: 0,
    goodCount: 0,
    easyCount: 0,
  };
}

/** Suma una respuesta al acumulado del día al que pertenece. */
function accumulateDailyStats(
  buckets: Map<string, DailyStatsAccumulator>,
  rating: SrsRating,
  previousStatus: string,
  timeSpentMs: number,
  reviewedAt: Date
): void {
  const studyDate = today(reviewedAt);
  const key = toIsoDay(studyDate);
  const bucket = buckets.get(key) ?? emptyDailyStatsAccumulator(studyDate);
  const isNew = previousStatus === "new";

  bucket.totalCards += 1;
  bucket.newCards += isNew ? 1 : 0;
  bucket.reviewCards += isNew ? 0 : 1;
  bucket.totalTimeSpentMs += timeSpentMs;
  bucket[STUDY_RATING_COUNTER_FIELD[rating]] += 1;

  buckets.set(key, bucket);
}

async function writeDailyStats(
  tx: Prisma.TransactionClient,
  userId: string,
  bucket: DailyStatsAccumulator
): Promise<void> {
  await tx.dailyStudyStats.upsert({
    where: { userId_studyDate: { userId, studyDate: bucket.studyDate } },
    create: {
      userId,
      studyDate: bucket.studyDate,
      totalCards: bucket.totalCards,
      newCards: bucket.newCards,
      reviewCards: bucket.reviewCards,
      totalTimeSpentMs: bucket.totalTimeSpentMs,
      againCount: bucket.againCount,
      hardCount: bucket.hardCount,
      goodCount: bucket.goodCount,
      easyCount: bucket.easyCount,
    },
    update: {
      totalCards: { increment: bucket.totalCards },
      newCards: { increment: bucket.newCards },
      reviewCards: { increment: bucket.reviewCards },
      totalTimeSpentMs: { increment: bucket.totalTimeSpentMs },
      againCount: { increment: bucket.againCount },
      hardCount: { increment: bucket.hardCount },
      goodCount: { increment: bucket.goodCount },
      easyCount: { increment: bucket.easyCount },
    },
  });
}

async function bumpDailyStats(
  tx: Prisma.TransactionClient,
  userId: string,
  rating: SrsRating,
  previousStatus: string,
  timeSpentMs: number,
  now: Date
): Promise<void> {
  const buckets = new Map<string, DailyStatsAccumulator>();

  accumulateDailyStats(buckets, rating, previousStatus, timeSpentMs, now);

  for (const bucket of buckets.values()) {
    await writeDailyStats(tx, userId, bucket);
  }
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
      // La sesión está cerrada: las claves de idempotencia ya no sirven de nada.
      appliedAnswerKeys: [],
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
/* Panel de estudio: qué mazos hay y cuál se puede reanudar                    */
/* ------------------------------------------------------------------------- */

/**
 * Recuento de tarjetas por mazo y por cubo (RF-002, RF-012).
 *
 * El panel informa de lo que contiene cada mazo, no de lo que "toca" hoy: como
 * ya no hay cupos diarios ni filtro de vencimiento, todas las tarjetas no
 * suspendidas entran en la sesión.
 */
export async function getStudyOverview(
  userId: string,
  input: { deckId?: string | null; languageId?: string | null }
): Promise<StudyOverview> {
  const resumable = await getResumableSession(userId);
  // El catálogo se siembra si el usuario aún no tiene ninguno, para que el filtro
  // de idiomas exista aunque todavía no haya creado mazos.
  const languages = await ensureUserLanguages(userId);

  const decks = await prisma.deck.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      slug: true,
      parentDeckId: true,
      isArchived: true,
      lastStudiedAt: true,
      languageId: true,
      language: { select: { id: true, code: true, name: true, flag: true } },
    },
  });

  if (decks.length === 0) {
    return {
      allDecks: { new: 0, learning: 0, review: 0, remaining: 0, totalCards: 0 },
      totalCards: 0,
      decks: [],
      languages: languages.map((language) => ({ ...language, deckCount: 0, cardCount: 0 })),
      activeLanguageId: null,
      resumable,
    };
  }

  const rows = await prisma.card.findMany({
    where: { userId, isSuspended: false },
    select: { deckId: true, scheduling: { select: { status: true } } },
  });

  // Cada tarjeta se clasifica una sola vez y luego se agrega por mazo y por ámbito,
  // para que los contadores del panel y los de "Todos los mazos" no puedan divergir.
  const classified = rows.flatMap((row) =>
    row.scheduling ? [{ deckId: row.deckId, status: row.scheduling.status }] : []
  );

  // Las profundidades se calculan sobre todos los mazos: si no, un sub-mazo cuyo
  // padre queda fuera del filtro aparecería como mazo raíz.
  const depths = computeDeckDepths(decks);
  const perDeck = new Map<string, string[]>();

  for (const deck of decks) {
    perDeck.set(deck.id, []);
  }

  for (const row of classified) {
    perDeck.get(row.deckId)?.push(row.status);
  }

  const languageFilters = buildLanguageFilters(languages, decks, perDeck);

  // Un idioma que no está en el catálogo (o que no sea del usuario) se ignora en
  // lugar de dejar la pantalla vacía sin explicación.
  const activeLanguageId =
    input.languageId && languageFilters.some((language) => language.id === input.languageId)
      ? input.languageId
      : null;

  const visibleDecks = activeLanguageId
    ? decks.filter((deck) => deck.languageId === activeLanguageId)
    : decks;

  const options: StudyDeckOption[] = visibleDecks
    .map((deck) => {
      const statuses = perDeck.get(deck.id) ?? [];

      return {
        id: deck.id,
        name: deck.name,
        slug: deck.slug,
        depth: depths.get(deck.id) ?? 1,
        isArchived: deck.isArchived,
        language: deck.language,
        counts: countBuckets(statuses),
        totalCards: statuses.length,
        lastStudiedAt: deck.lastStudiedAt ? deck.lastStudiedAt.toISOString() : null,
      };
    })
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name, "es"));

  // Con mazo seleccionado, el bloque "Todos los mazos" se restringe a su rama para
  // que la pantalla de inicio y el contador grande no se contradigan. El filtro de
  // idioma se le aplica después, para no contar mazos que no se están mostrando.
  const branchIds =
    input.deckId && perDeck.has(input.deckId)
      ? collectDeckBranchIds(decks, input.deckId)
      : null;

  const scopeIds = visibleDecks
    .filter((deck) => !branchIds || branchIds.has(deck.id))
    .map((deck) => deck.id);

  const inScope = classified.filter((row) => scopeIds.includes(row.deckId));

  return {
    allDecks: {
      ...countBuckets(inScope.map((row) => row.status)),
      totalCards: inScope.length,
    },
    // El chip "Todos" compara con el total sin filtrar, que es la única cifra que no
    // depende del idioma activo.
    totalCards: classified.length,
    decks: options,
    languages: languageFilters,
    activeLanguageId,
    resumable,
  };
}

/**
 * Catálogo de idiomas con el número de mazos y tarjetas de cada uno. Se cuenta
 * sobre todos los mazos del usuario, no sobre los filtrados, para que al cambiar
 * de idioma se vean las opciones con su peso real.
 */
function buildLanguageFilters(
  languages: { id: string; code: string; name: string; flag: string | null }[],
  decks: { id: string; languageId: string | null }[],
  perDeck: Map<string, string[]>
): StudyLanguageFilter[] {
  const deckCountByLanguage = new Map<string, number>();
  const cardCountByLanguage = new Map<string, number>();

  for (const deck of decks) {
    if (!deck.languageId) {
      continue;
    }

    deckCountByLanguage.set(deck.languageId, (deckCountByLanguage.get(deck.languageId) ?? 0) + 1);
    cardCountByLanguage.set(
      deck.languageId,
      (cardCountByLanguage.get(deck.languageId) ?? 0) + (perDeck.get(deck.id)?.length ?? 0)
    );
  }

  return languages.map((language) => ({
    id: language.id,
    code: language.code,
    name: language.name,
    flag: language.flag,
    deckCount: deckCountByLanguage.get(language.id) ?? 0,
    cardCount: cardCountByLanguage.get(language.id) ?? 0,
  }));
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
  /** POST /api/study/start — RF-001, RF-002, RF-022. */
  start: protectedProcedure
    .input(studyStartInputSchema)
    .handler(async ({ input, context }): Promise<StudyStartResult> =>
      startStudySession(context.user.id, input)
    ),

  /** GET /api/study/deck?deck_id=[id] — todas las tarjetas de un mazo (RF-024). */
  deckCards: protectedProcedure
    .input(studyDeckCardsInputSchema)
    .handler(async ({ input, context }): Promise<StudyDeckCardsResult> =>
      getStudyDeckCards(context.user.id, input)
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

  /** GET /api/study/due?deck_id=[id] — qué hay en cada mazo y qué se puede reanudar. */
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

  /**
   * POST /api/study/session/[id]/review/batch — guarda todas las calificaciones de
   * la sesión de una vez. Es la vía que usa la interfaz de estudio: el SRS se
   * calcula en el navegador y el lote se envía al recorrer la cola.
   */
  reviewBatch: protectedProcedure
    .input(studyReviewBatchInputSchema)
    .handler(async ({ input, context }): Promise<StudyReviewBatchResult> =>
      reviewStudyCardsBatch(context.user.id, input)
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