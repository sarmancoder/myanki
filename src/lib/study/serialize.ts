import type { Prisma } from "@prisma/client";
import { isCardColorTag, isCardStatus, isCardType } from "@/constants/cards";
import { isStudySessionStatus } from "@/constants/study";
import { normalizeExtraFields } from "@/lib/cards/extra-fields";
import { toNumber } from "@/lib/cards/serialize";
import { bucketForStatus, toAccuracy } from "@/lib/study/queue";
import type {
  StudyCardView,
  StudyDailyStatEntry,
  StudyDeckCardView,
  StudyHistoryEntry,
  StudyQueueCounts,
  StudyQueueItemView,
  StudySessionView,
} from "@/types/study";

export const studySessionSelect = {
  id: true,
  userId: true,
  deckId: true,
  startedAt: true,
  endedAt: true,
  totalCards: true,
  againCount: true,
  hardCount: true,
  goodCount: true,
  easyCount: true,
  totalTimeSpentMs: true,
  isCompleted: true,
  isCramMode: true,
  status: true,
  pausedAt: true,
  elapsedMs: true,
  currentCardId: true,
  // Claves de las respuestas ya guardadas de la sesión. Se leen al aplicar el
  // lote de calificaciones y nunca viajan al cliente: no forman parte de la vista.
  appliedAnswerKeys: true,
  deck: { select: { name: true, slug: true } },
} satisfies Prisma.StudySessionSelect;

export type StudySessionWithDeck = Prisma.StudySessionGetPayload<{
  select: typeof studySessionSelect;
}>;

/** Estado de scheduling que viaja al cliente para pintar los intervalos (RF-009). */
const studyCardSelect = {
  id: true,
  deckId: true,
  cardType: true,
  front: true,
  back: true,
  extraFields: true,
  imageUrl: true,
  audioUrl: true,
  colorTag: true,
  createdAt: true,
  // El idioma del mazo se lleva al cliente para elegir la voz que pronuncia el
  // anverso de la tarjeta al presentarla.
  deck: { select: { name: true, language: { select: { code: true } } } },
  scheduling: {
    select: {
      status: true,
      intervalDays: true,
      easeFactor: true,
      repetitions: true,
      lapses: true,
      lastReviewedAt: true,
    },
  },
} satisfies Prisma.CardSelect;

export type StudyCardRow = Prisma.CardGetPayload<{ select: typeof studyCardSelect }>;

/** Convierte una fila de `cards` en la vista que consume la interfaz de estudio. */
export function toStudyCardView(row: StudyCardRow): StudyCardView {
  const scheduling = row.scheduling;

  return {
    id: row.id,
    deckId: row.deckId,
    deckName: row.deck.name,
    cardType: isCardType(row.cardType) ? row.cardType : "basic",
    front: row.front,
    back: row.back,
    extraFields: normalizeExtraFields(row.extraFields),
    imageUrl: row.imageUrl,
    audioUrl: row.audioUrl,
    colorTag: row.colorTag && isCardColorTag(row.colorTag) ? row.colorTag : null,
    languageCode: row.deck.language?.code ?? null,
    scheduling: {
      status:
        scheduling && isCardStatus(scheduling.status) ? scheduling.status : "new",
      intervalDays: scheduling?.intervalDays ?? 0,
      easeFactor: toNumber(scheduling?.easeFactor),
      repetitions: scheduling?.repetitions ?? 0,
      lapses: scheduling?.lapses ?? 0,
      lastReviewedAt: scheduling?.lastReviewedAt
        ? scheduling.lastReviewedAt.toISOString()
        : null,
    },
  };
}

/** Tarjeta concreta de un mazo, tal y como se muestra en la pantalla de estudio. */
export const studyDeckCardSelect = {
  id: true,
  cardType: true,
  front: true,
  back: true,
  extraFields: true,
  imageUrl: true,
  audioUrl: true,
  colorTag: true,
  isSuspended: true,
  createdAt: true,
  scheduling: {
    select: {
      status: true,
      dueDate: true,
      repetitions: true,
      lapses: true,
      lastReviewedAt: true,
    },
  },
} satisfies Prisma.CardSelect;

/**
 * Convierte una fila de `cards` en la vista del listado de la pantalla de estudio.
 * Una tarjeta sin scheduling no se puede calificar, así que se descarta en lugar
 * de inventarse un estado.
 */
export function toStudyDeckCardView(
  row: Prisma.CardGetPayload<{ select: typeof studyDeckCardSelect }>
): StudyDeckCardView | null {
  if (!row.scheduling) {
    return null;
  }

  return {
    id: row.id,
    cardType: isCardType(row.cardType) ? row.cardType : "basic",
    front: row.front,
    back: row.back,
    extraFields: normalizeExtraFields(row.extraFields),
    imageUrl: row.imageUrl,
    audioUrl: row.audioUrl,
    colorTag: row.colorTag && isCardColorTag(row.colorTag) ? row.colorTag : null,
    isSuspended: row.isSuspended,
    status: isCardStatus(row.scheduling.status) ? row.scheduling.status : "new",
    studyCount: row.scheduling.repetitions + row.scheduling.lapses,
    dueDate: row.scheduling.dueDate ? row.scheduling.dueDate.toISOString() : null,
    lastReviewedAt: row.scheduling.lastReviewedAt
      ? row.scheduling.lastReviewedAt.toISOString()
      : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Entrada de la cola pendiente de una sesión. */
export function toQueueItem(cardId: string, status: string): StudyQueueItemView {
  const normalized = isCardStatus(status) ? status : "new";

  return {
    cardId,
    status: normalized,
    bucket: bucketForStatus(normalized),
  };
}

/** Vista de `study_sessions` que se envía al cliente. */
export function toStudySessionView(
  row: StudySessionWithDeck,
  counts: StudyQueueCounts
): StudySessionView {
  return {
    id: row.id,
    deckId: row.deckId,
    deckName: row.deck?.name ?? null,
    deckSlug: row.deck?.slug ?? null,
    status: isStudySessionStatus(row.status) ? row.status : "active",
    isCramMode: row.isCramMode,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    elapsedMs: row.elapsedMs,
    totalCards: row.totalCards,
    againCount: row.againCount,
    hardCount: row.hardCount,
    goodCount: row.goodCount,
    easyCount: row.easyCount,
    totalTimeSpentMs: row.totalTimeSpentMs,
    isCompleted: row.isCompleted,
    currentCardId: row.currentCardId,
    counts,
    accuracy: toAccuracy(row.againCount, row.hardCount, row.goodCount, row.easyCount),
  };
}

export function toStudyHistoryEntry(row: StudySessionWithDeck): StudyHistoryEntry {
  return {
    id: row.id,
    deckName: row.deck?.name ?? null,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    totalCards: row.totalCards,
    againCount: row.againCount,
    hardCount: row.hardCount,
    goodCount: row.goodCount,
    easyCount: row.easyCount,
    durationMs: row.elapsedMs,
    accuracy: toAccuracy(row.againCount, row.hardCount, row.goodCount, row.easyCount),
    isCramMode: row.isCramMode,
    isCompleted: row.isCompleted,
  };
}

export function toStudyDailyStatEntry(row: {
  studyDate: Date;
  totalCards: number;
  newCards: number;
  reviewCards: number;
  totalTimeSpentMs: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
}): StudyDailyStatEntry {
  return {
    studyDate: row.studyDate.toISOString().slice(0, 10),
    totalCards: row.totalCards,
    newCards: row.newCards,
    reviewCards: row.reviewCards,
    totalTimeSpentMs: row.totalTimeSpentMs,
    againCount: row.againCount,
    hardCount: row.hardCount,
    goodCount: row.goodCount,
    easyCount: row.easyCount,
    accuracy: toAccuracy(row.againCount, row.hardCount, row.goodCount, row.easyCount),
  };
}

export { studyCardSelect };