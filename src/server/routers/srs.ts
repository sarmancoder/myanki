import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/cards/serialize";
import { protectedProcedure } from "@/server/procedures";
import { DEFAULT_INITIAL_EASE_FACTOR, LAPSE_REVIEW_THRESHOLD, SRS_RATINGS } from "@/constants/srs";
import { isCardStatus, type CardStatus } from "@/constants/cards";
import { applySrsReview, getOrCreateSrsSettings } from "@/lib/srs/apply";
import {
  scheduleWithLabel,
  toSrsScheduleSettings,
  toSrsSettingsView,
  type SrsSettingsRow,
} from "@/lib/srs/serialize";
import { addUtcDays, startOfUtcDay } from "@/lib/srs/dates";
import {
  srsCalculateInputSchema,
  srsDueCardsInputSchema,
  srsReviewInputSchema,
  srsSettingsUpdateInputSchema,
  type SrsPreviewState,
  type SrsSettingsUpdateInput,
} from "@/lib/validation/srs";
import type {
  SrsCalculateResult,
  SrsDueCardItem,
  SrsDueCardsResult,
  SrsDueCounts,
  SrsRatingPreview,
  SrsReviewInput,
  SrsReviewResult,
  SrsSettingsResult,
  SrsSettingsUpdateResult,
} from "@/types/srs";

/**
 * La fila de `srs_settings` se crea al registrarse y al entrar con Google, pero
 * un usuario que ya existía antes de este módulo puede no tenerla. En ese caso
 * se crea con los valores por defecto de la spec en lugar de fallar.
 */
export async function ensureSettings(userId: string): Promise<SrsSettingsRow> {
  return getOrCreateSrsSettings(userId);
}

/** Lee la configuración SRS del usuario, creándola si hace falta. */
export async function getSrsSettings(userId: string): Promise<SrsSettingsResult> {
  const row = await ensureSettings(userId);

  return { settings: toSrsSettingsView(row) };
}

/**
 * Guarda la configuración SRS. RF-019: los cambios solo afectan a futuras
 * calificaciones, las tarjetas ya programadas no se recalculan.
 */
export async function updateSrsSettings(
  userId: string,
  input: SrsSettingsUpdateInput
): Promise<SrsSettingsUpdateResult> {
  const row = await prisma.srsSettings.upsert({
    where: { userId },
    update: {
      algorithm: input.algorithm,
      initialEaseFactor: input.initialEaseFactor,
      minimumEaseFactor: input.minimumEaseFactor,
      maxIntervalDays: input.maxIntervalDays,
      learningSteps: input.learningSteps,
      relearningSteps: input.relearningSteps,
    },
    create: { userId, ...input },
  });

  return { settings: toSrsSettingsView(row) };
}

/**
 * Vista previa de los intervalos de las cuatro calificaciones (RF-008). No
 * escribe nada: solo simula a partir del estado indicado.
 */
export async function previewSrsIntervals(
  userId: string,
  state: SrsPreviewState
): Promise<SrsCalculateResult> {
  const settings = toSrsScheduleSettings(await ensureSettings(userId));
  const now = new Date();

  const previews: SrsRatingPreview[] = SRS_RATINGS.map((rating) => {
    const result = scheduleWithLabel(
      {
        status: state.status,
        easeFactor: state.easeFactor || DEFAULT_INITIAL_EASE_FACTOR,
        // En learning/relearning el intervalo son minutos del paso, no días.
        intervalDays: state.status === "review" ? state.intervalDays : 0,
        repetitions: state.repetitions,
        lapses: state.lapses,
        elapsedDays: state.elapsedDays,
      },
      rating,
      settings,
      now
    );

    return {
      rating,
      status: result.status,
      easeFactor: result.easeFactor,
      intervalDays: result.intervalDays,
      delayMinutes: result.delayMinutes,
      intervalLabel: result.intervalLabel,
      dueDate: result.dueDate.toISOString(),
    };
  });

  return {
    previews,
    // El aviso RF-017 se dispara cuando la tarjeta *ya* supera el umbral; la
    // vista previa no presupone con qué calificación se va a responder.
    shouldReviewCard: state.lapses > LAPSE_REVIEW_THRESHOLD,
  };
}

/**
 * Límite de vencimiento para el día en curso: `due_date` es una columna DATE,
 * así que una tarjeta con intervalo en días vence a fin de ese día.
 */
function dueLimit(now: Date): Date {
  return addUtcDays(startOfUtcDay(now), 1);
}

function emptyDueCounts(): SrsDueCounts {
  return { new: 0, learning: 0, review: 0, relearning: 0, dueToday: 0 };
}

export interface SrsDueCardsQuery {
  deckId: string;
  page: number;
  pageSize: number;
  includeNew: boolean;
}

/** Tarjetas pendientes de estudiar en un mazo, con los contadores por estado. */
export async function getDueCards(
  userId: string,
  input: SrsDueCardsQuery
): Promise<SrsDueCardsResult> {
  const deck = await prisma.deck.findFirst({
    where: { id: input.deckId, userId },
    select: { id: true },
  });

  if (!deck) {
    throw new Error("El mazo no existe");
  }

  const limit = dueLimit(new Date());

  const baseWhere = {
    deckId: deck.id,
    userId,
    isSuspended: false,
  } satisfies Prisma.CardWhereInput;

  const [byStatus, dueRows, total] = await Promise.all([
    prisma.cardScheduling.groupBy({
      by: ["status"],
      where: { userId, card: baseWhere },
      _count: { _all: true },
    }),
    prisma.card.findMany({
      where: {
        ...baseWhere,
        scheduling: {
          dueDate: { lte: limit },
          ...(input.includeNew ? {} : { status: { not: "new" } }),
        },
      },
      select: {
        id: true,
        scheduling: {
          select: {
            status: true,
            dueDate: true,
            intervalDays: true,
            easeFactor: true,
            repetitions: true,
            lapses: true,
          },
        },
      },
      // Por fecha de vencimiento (que en learning/relearning es el día en el que
      // reaparece) y, a igualdad de fecha, por antigüedad de la tarjeta.
      orderBy: [{ scheduling: { dueDate: "asc" } }, { createdAt: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.card.count({ where: { ...baseWhere, scheduling: { dueDate: { lte: limit } } } }),
  ]);

  const counts = emptyDueCounts();

  // Un `status` fuera de la enumeración se ignora: una fila escrita a mano no
  // debe romper los contadores del mazo.
  for (const group of byStatus) {
    if (isCardStatus(group.status)) {
      counts[group.status] = group._count._all;
    }
  }

  const cards: SrsDueCardItem[] = dueRows.flatMap((row) => {
    if (!row.scheduling) {
      return [];
    }

    return [
      {
        cardId: row.id,
        status: row.scheduling.status as CardStatus,
        dueDate: row.scheduling.dueDate.toISOString(),
        intervalDays: row.scheduling.intervalDays,
        easeFactor: toNumber(row.scheduling.easeFactor),
        repetitions: row.scheduling.repetitions,
        lapses: row.scheduling.lapses,
        shouldReviewCard: row.scheduling.lapses > LAPSE_REVIEW_THRESHOLD,
      },
    ];
  });

  return {
    cards,
    counts: { ...counts, dueToday: total },
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

/**
 * Registra una calificación y actualiza el scheduling de la tarjeta.
 *
 * El guardado real vive en `lib/srs/apply.ts` para que el módulo de estudio
 * (spec 05) pueda reutilizarlo dentro de su propia transacción.
 */
export async function reviewCard(
  userId: string,
  input: SrsReviewInput
): Promise<SrsReviewResult> {
  const result = await applySrsReview({
    userId,
    cardId: input.cardId,
    rating: input.rating,
    timeSpentMs: input.timeSpentMs ?? null,
  });

  return {
    cardId: result.cardId,
    status: result.status,
    easeFactor: result.easeFactor,
    intervalDays: result.intervalDays,
    delayMinutes: result.delayMinutes,
    intervalLabel: result.intervalLabel,
    dueDate: result.dueDate.toISOString(),
    repetitions: result.repetitions,
    lapses: result.lapses,
    shouldReviewCard: result.shouldReviewCard,
  };
}

/**
 * Los handlers viven aquí, fuera de los procedimientos, para poder invocarlos
 * desde comprobaciones sin levantar el middleware de autenticación (que necesita
 * el contexto de petición de Next.js). Los procedimientos solo inyectan el
 * `userId` del contexto.
 */
export const srsRouter = {
  /** GET /api/srs/settings */
  getSettings: protectedProcedure.handler(async ({ context }): Promise<SrsSettingsResult> =>
    getSrsSettings(context.user.id)
  ),

  /** PATCH /api/srs/settings */
  updateSettings: protectedProcedure
    .input(srsSettingsUpdateInputSchema)
    .handler(async ({ input, context }): Promise<SrsSettingsUpdateResult> =>
      updateSrsSettings(context.user.id, input)
    ),

  /** POST /api/srs/calculate — vista previa sin guardar nada. */
  calculate: protectedProcedure
    .input(srsCalculateInputSchema)
    .handler(async ({ input, context }): Promise<SrsCalculateResult> =>
      previewSrsIntervals(context.user.id, input.state)
    ),

  /** GET /api/srs/due-cards?deck_id=[id] */
  getDueCards: protectedProcedure
    .input(srsDueCardsInputSchema)
    .handler(async ({ input, context }): Promise<SrsDueCardsResult> =>
      getDueCards(context.user.id, input)
    ),

  /** POST /api/srs/review — registra la calificación y actualiza el scheduling. */
  review: protectedProcedure
    .input(srsReviewInputSchema)
    .handler(async ({ input, context }): Promise<SrsReviewResult> =>
      reviewCard(context.user.id, input)
    ),
};

export type SrsRouter = typeof srsRouter;