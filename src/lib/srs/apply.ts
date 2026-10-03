import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CardStatus } from "@/constants/cards";
import type { SrsScheduleSettings, SrsScheduleState } from "@/lib/srs/algorithm";
import { elapsedDays } from "@/lib/srs/dates";
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

/** Subconjunto de `cards` que necesita el cálculo del scheduling. */
const reviewCardSelect = {
  id: true,
  deckId: true,
  isSuspended: true,
  scheduling: { select: schedulingSelect },
} satisfies Prisma.CardSelect;

/** Tarjeta con su scheduling, tal y como la lee el cálculo de una calificación. */
export type SrsReviewCard = Prisma.CardGetPayload<{ select: typeof reviewCardSelect }>;

/**
 * Una calificación ya resuelta junto con la fecha en que se respondió: es lo que
 * permite encadenar la siguiente respuesta de la misma tarjeta.
 */
export interface AppliedSrsReviewAt extends AppliedSrsReview {
  reviewedAt: Date;
}

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
  /**
   * Configuración ya cargada. El estudio la resuelve una vez y la reutiliza para
   * todo el lote de respuestas, en lugar de releerla por cada tarjeta.
   */
  settings?: SrsScheduleSettings;
  /** `new` = 23:59:59.999 del día en curso; solo informativo en el resultado. */
  now?: Date;
}

export interface AppliedSrsReview {
  cardId: string;
  deckId: string;
  status: CardStatus;
  /** Estado del SRS antes de aplicar la calificación: lo usa `daily_study_stats` (RF-003). */
  previousStatus: CardStatus;
  /** Intervalo que tenía la tarjeta antes de la calificación, para el historial. */
  intervalBefore: number;
  /** Factor de facilidad anterior, o `null` si la tarjeta aún no estaba programada. */
  easeBefore: number | null;
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
 * repasos y la fecha de último estudio del mazo. Es la única fuente de verdad del
 * guardado: la usan igual el procedimiento `srs.review` y el módulo de estudio,
 * que para un lote de respuestas resuelve antes todas las tarjetas con
 * `computeSrsReview` y entra en la transacción solo a escribirlas.
 */
export async function applySrsReview(params: ApplySrsReviewParams): Promise<AppliedSrsReview> {
  const { userId, cardId, rating } = params;
  const client = params.client ?? prisma;
  const now = params.now ?? new Date();

  // La tarjeta se valida antes de tocar `srs_settings`: si el `userId` no
  // pertenece a nadie, `getOrCreateSrsSettings` intentaría crear una fila huérfana
  // y la base de datos rechazaría el `INSERT` en lugar de devolver un error claro.
  const card = await client.card.findFirst({
    where: { id: cardId, userId },
    select: reviewCardSelect,
  });

  if (!card) {
    throw new Error("La tarjeta no existe");
  }

  const settings =
    params.settings ?? toSrsScheduleSettings(await getOrCreateSrsSettings(userId, client));
  const result = computeSrsReview(card, rating, settings, now);

  await writeSrsReviewSchedule(client, card.id, result, now);

  await client.cardReview.create({
    data: toSrsReviewRecord(userId, card.id, result, rating, params.timeSpentMs ?? null, now),
  });

  // La ficha del mazo muestra cuándo se estudió por última vez; se actualiza en
  // la misma transacción para que el detalle del mazo no quede desfasado.
  await client.deck.update({
    where: { id: card.deckId },
    data: { lastStudiedAt: now },
  });

  return result;
}

/**
 * Calcula a dónde va la tarjeta según el scheduling que tiene ahora, sin tocar la
 * base de datos.
 *
 * Separar el cálculo del guardado es lo que permite al lote de estudio resolver
 * todas sus tarjetas antes de abrir la transacción: dentro de ella solo se
 * escribe, y una transacción que solo escribe dura mucho menos que una que además
 * espera al servidor en cada consulta.
 */
export function computeSrsReview(
  card: SrsReviewCard,
  rating: SrsRating,
  settings: SrsScheduleSettings,
  now: Date = new Date()
): AppliedSrsReview {
  assertReviewable(card);

  const review = reviewFromState(card, toScheduleState(card.scheduling, now), rating, settings, now);

  // `toScheduleState` usa 0 como valor centinela para "sin fila de scheduling";
  // en el historial esa ausencia se guarda como `null`.
  return card.scheduling ? review : { ...review, easeBefore: null };
}

/**
 * Calcula la respuesta siguiente de una tarjeta que ya se acaba de calificar en el
 * mismo lote.
 *
 * El lote de estudio encadena las suyas: dos respuestas de la misma tarjeta —dos
 * pasos de aprendizaje seguidos— cuentan como dos calificaciones y se calculan una
 * detrás de otra, igual que si se hubieran guardado por separado. La segunda parte,
 * por tanto, del estado que dejó la primera y no del que había en la base de datos
 * cuando llegó el lote.
 */
export function computeNextSrsReview(
  card: SrsReviewCard,
  previous: AppliedSrsReviewAt,
  rating: SrsRating,
  settings: SrsScheduleSettings,
  now: Date
): AppliedSrsReview {
  assertReviewable(card);

  return reviewFromState(card, toNextSrsScheduleState(previous, now), rating, settings, now);
}

/** Una tarjeta suspendida no se programa, aunque llegue en el lote. */
function assertReviewable(card: Pick<SrsReviewCard, "isSuspended">): void {
  if (card.isSuspended) {
    throw new Error("La tarjeta está suspendida");
  }
}

function reviewFromState(
  card: Pick<SrsReviewCard, "id" | "deckId">,
  state: SrsScheduleState,
  rating: SrsRating,
  settings: SrsScheduleSettings,
  now: Date
): AppliedSrsReview {
  const result = scheduleWithLabel(state, rating, settings, now);

  return {
    cardId: card.id,
    deckId: card.deckId,
    status: result.status,
    previousStatus: state.status,
    intervalBefore: state.intervalDays,
    easeBefore: state.easeFactor,
    easeFactor: result.easeFactor,
    intervalDays: result.intervalDays,
    delayMinutes: result.delayMinutes,
    intervalLabel: result.intervalLabel,
    dueDate: result.dueDate,
    repetitions: result.repetitions,
    lapses: result.lapses,
    shouldReviewCard: result.shouldReviewCard,
  };
}

/**
 * Estado que deja una calificación aplicada: es exactamente lo mismo que
 * devolvería `toScheduleState` tras leer la fila que escribe
 * `writeSrsReviewSchedule`, así que la respuesta encadenada razona sobre lo que
 * habrá en la base de datos.
 */
function toNextSrsScheduleState(previous: AppliedSrsReviewAt, now: Date): SrsScheduleState {
  return {
    status: previous.status,
    easeFactor: previous.easeFactor,
    intervalDays: previous.intervalDays,
    repetitions: previous.repetitions,
    lapses: previous.lapses,
    elapsedDays: elapsedDays(previous.reviewedAt, now),
  };
}

/**
 * Lee en una sola consulta todas las tarjetas que hay que calificar.
 *
 * El lote de estudio las necesita juntas: leerlas de una en una multiplica las
 * idas a la base de datos por el número de tarjetas de la sesión.
 */
export function loadSrsReviewCards(
  userId: string,
  cardIds: string[],
  client: SrsDbClient = prisma
): Promise<SrsReviewCard[]> {
  return client.card.findMany({
    where: { userId, id: { in: cardIds } },
    select: reviewCardSelect,
  });
}

/** Escribe en `card_scheduling` el resultado que devuelve `computeSrsReview`. */
export async function writeSrsReviewSchedule(
  client: SrsDbClient,
  cardId: string,
  review: AppliedSrsReview,
  reviewedAt: Date
): Promise<void> {
  await client.cardScheduling.update({
    where: { cardId },
    data: {
      status: review.status,
      easeFactor: review.easeFactor,
      intervalDays: review.intervalDays,
      repetitions: review.repetitions,
      lapses: review.lapses,
      dueDate: toStoredDueDate(review),
      lastReviewedAt: reviewedAt,
    },
  });
}

/** Fila de `card_reviews` que corresponde a una calificación ya calculada. */
export function toSrsReviewRecord(
  userId: string,
  cardId: string,
  review: AppliedSrsReview,
  rating: SrsRating,
  timeSpentMs: number | null,
  reviewedAt: Date
): Prisma.CardReviewUncheckedCreateInput {
  return {
    cardId,
    userId,
    rating,
    // La fecha es la de la respuesta, no la del guardado: el lote de estudio
    // puede tardar en llegar y el historial debe reflejar cuándo se estudió.
    reviewedAt,
    timeSpentMs,
    intervalBefore: review.intervalBefore,
    intervalAfter: review.intervalDays,
    easeBefore: review.easeBefore,
    easeAfter: review.easeFactor,
  };
}

/**
 * Marca como estudiados ahora los mazos de un lote. Un lote puede abarcar varios
 * mazos, así que se recorren los distintos: repetir la misma escritura por
 * tarjeta no aportaría nada.
 */
export async function touchDecksStudied(
  client: SrsDbClient,
  deckIds: string[],
  now: Date
): Promise<void> {
  for (const deckId of deckIds) {
    await client.deck.update({ where: { id: deckId }, data: { lastStudiedAt: now } });
  }
}