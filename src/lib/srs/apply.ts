import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isCardStatus, type CardStatus } from "@/constants/cards";
import { formatInterval, type SrsScheduleSettings } from "@/lib/srs/algorithm";
import {
  scheduleWithLabel,
  toScheduleState,
  toSrsScheduleSettings,
  toStoredDueDate,
  type SrsSettingsRow,
} from "@/lib/srs/serialize";
import type { SrsRating } from "@/constants/srs";

/**
 * Cliente de base de datos que admite tanto Prisma como una transacción en
 * curso: el módulo de estudio (spec 05) necesita escribir el scheduling y los
 * contadores de la sesión en la misma transacción, así que reutiliza esta
 * lógica pasándole su `tx`.
 */
export type SrsDbClient = Prisma.TransactionClient;

/** Subconjunto de `card_scheduling` que necesita el cálculo del scheduling. */
const schedulingSelect = {
  status: true,
  easeFactor: true,
  intervalDays: true,
  repetitions: true,
  lapses: true,
  lastReviewedAt: true,
} satisfies Prisma.CardSchedulingSelect;

/**
 * La fila de `srs_settings` se crea al registrarse y al entrar con Google, pero
 * un usuario que ya existía antes del módulo SRS puede no tenerla. En ese caso
 * se crea con los valores por defecto de la spec en lugar de fallar.
 */
export async function getOrCreateSrsSettings(
  userId: string,
  client: SrsDbClient = prisma
): Promise<SrsSettingsRow> {
  const existing = await client.srsSettings.findUnique({ where: { userId } });

  if (existing) {
    return existing;
  }

  return client.srsSettings.create({ data: { userId } });
}

/** Configuración efectiva del planificador a partir de la fila de `srs_settings`. */
export async function loadSrsScheduleSettings(userId: string): Promise<SrsScheduleSettings> {
  return toSrsScheduleSettings(await getOrCreateSrsSettings(userId));
}

export interface ApplySrsReviewParams {
  userId: string;
  cardId: string;
  rating: SrsRating;
  /** Milisegundos que el usuario tardó en responder; se guarda en `card_reviews`. */
  timeSpentMs?: number | null;
  /** Cliente alternativo (transacción en curso). Por defecto, `prisma`. */
  client?: SrsDbClient;
  /** `new` = 23:59:59.999 del día en curso; solo informativo en el resultado. */
  now?: Date;
}

export interface AppliedSrsReview {
  cardId: string;
  deckId: string;
  status: CardStatus;
  /** Estado del SRS antes de aplicar la calificación: lo usa `daily_study_stats` (RF-003). */
  previousStatus: CardStatus;
  easeFactor: number;
  intervalDays: number;
  delayMinutes: number;
  intervalLabel: string;
  dueDate: Date;
  repetitions: number;
  lapses: number;
  shouldReviewCard: boolean;
}

/**
 * Registra una calificación y actualiza el scheduling de la tarjeta.
 *
 * La transacción mantiene sincronizados `card_scheduling`, el historial de
 * `card_reviews` y la fecha de último estudio del mazo. Es la única fuente de
 * verdad del guardado: la usan igual el procedimiento `srs.review` y el módulo de
 * estudio, que la invoca dentro de su propia transacción para que un fallo no
 * deje la sesión descuadrada.
 */
export async function applySrsReview(
  params: ApplySrsReviewParams
): Promise<AppliedSrsReview> {
  const { userId, cardId, rating } = params;
  const client = params.client ?? prisma;
  const now = params.now ?? new Date();

  // La tarjeta se valida antes de tocar `srs_settings`: si el `userId` no
  // pertenece a nadie, `getOrCreateSrsSettings` intentaría crear una fila huérfana
  // y la base de datos rechazaría el `INSERT` en lugar de devolver un error claro.
  const card = await client.card.findFirst({
    where: { id: cardId, userId },
    select: {
      id: true,
      deckId: true,
      isSuspended: true,
      scheduling: { select: schedulingSelect },
    },
  });

  if (!card) {
    throw new Error("La tarjeta no existe");
  }

  if (card.isSuspended) {
    throw new Error("La tarjeta está suspendida");
  }

  const settings = toSrsScheduleSettings(await getOrCreateSrsSettings(userId, client));
  const state = toScheduleState(card.scheduling, now);
  const result = scheduleWithLabel(state, rating, settings, now);

  await client.cardScheduling.update({
    where: { cardId: card.id },
    data: {
      status: result.status,
      easeFactor: result.easeFactor,
      intervalDays: result.intervalDays,
      repetitions: result.repetitions,
      lapses: result.lapses,
      dueDate: toStoredDueDate(result),
      lastReviewedAt: now,
    },
  });

  await client.cardReview.create({
    data: {
      cardId: card.id,
      userId,
      rating,
      timeSpentMs: params.timeSpentMs ?? null,
      intervalBefore: card.scheduling?.intervalDays ?? 0,
      intervalAfter: result.intervalDays,
      easeBefore: card.scheduling?.easeFactor ?? null,
      easeAfter: result.easeFactor,
    },
  });

  // La ficha del mazo muestra cuándo se estudió por última vez; se actualiza en
  // la misma transacción para que el detalle del mazo no quede desfasado.
  await client.deck.update({
    where: { id: card.deckId },
    data: { lastStudiedAt: now },
  });

  return {
    cardId: card.id,
    deckId: card.deckId,
    status: result.status,
    previousStatus: card.scheduling && isCardStatus(card.scheduling.status) ? card.scheduling.status : "new",
    easeFactor: result.easeFactor,
    intervalDays: result.intervalDays,
    delayMinutes: result.delayMinutes,
    intervalLabel: formatInterval(result.delayMinutes, result.intervalDays),
    dueDate: result.dueDate,
    repetitions: result.repetitions,
    lapses: result.lapses,
    shouldReviewCard: result.shouldReviewCard,
  };
}