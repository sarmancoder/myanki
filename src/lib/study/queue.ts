import type { CardStatus } from "@/constants/cards";
import { STUDY_STATUS_TO_BUCKET, type StudyCountBucket } from "@/constants/study";
import type { StudyQueueCounts } from "@/types/study";

/**
 * Tarjeta candidata a entrar en la cola de una sesión, con lo mínimo que hace
 * falta para ordenarla y limitarla. La construye el router a partir de Prisma.
 */
export interface StudyQueueCandidate {
  cardId: string;
  status: CardStatus;
  /** `card_scheduling.due_date`, una columna DATE sin hora. */
  dueDate: Date;
  /** Último repaso, para desempatar las tarjetas de aprendizaje del mismo día. */
  lastReviewedAt: Date | null;
  createdAt: Date;
}

/** Orden de prioridad de los bloques: aprendizaje → repaso → nueva. */
const BUCKET_PRIORITY: Record<StudyCountBucket, number> = {
  learning: 0,
  review: 1,
  new: 2,
};

/** Cubo del contador de sesión al que pertenece un estado del SRS (RF-012). */
export function bucketForStatus(status: string): StudyCountBucket {
  return STUDY_STATUS_TO_BUCKET[status] ?? "review";
}

export function emptyQueueCounts(): StudyQueueCounts {
  return { new: 0, learning: 0, review: 0, remaining: 0 };
}

/** Reparte un conjunto de estados en los contadores del contador de sesión (RF-012). */
export function countBuckets(statuses: readonly string[]): StudyQueueCounts {
  const counts = emptyQueueCounts();

  for (const status of statuses) {
    counts[bucketForStatus(status)] += 1;
  }

  counts.remaining = counts.new + counts.learning + counts.review;

  return counts;
}

function timeOf(value: Date): number {
  return value.getTime();
}

/**
 * Orden de estudio: primero las tarjetas en aprendizaje o reaprendizaje (para
 * que la cola no se alargue), después los repasos vencidos por orden de fecha y
 * al final las nuevas por antigüedad.
 */
export function compareQueueOrder(a: StudyQueueCandidate, b: StudyQueueCandidate): number {
  const priority = BUCKET_PRIORITY[bucketForStatus(a.status)] - BUCKET_PRIORITY[bucketForStatus(b.status)];

  if (priority !== 0) {
    return priority;
  }

  const dueDifference = timeOf(a.dueDate) - timeOf(b.dueDate);

  if (dueDifference !== 0) {
    return dueDifference;
  }

  // En aprendizaje todas las tarjetas vencen hoy (la columna DATE no guarda el
  // retardo en minutos), así que el desempate es la hora del último repaso.
  const lastA = a.lastReviewedAt ? timeOf(a.lastReviewedAt) : Number.NEGATIVE_INFINITY;
  const lastB = b.lastReviewedAt ? timeOf(b.lastReviewedAt) : Number.NEGATIVE_INFINITY;

  if (lastA !== lastB) {
    return lastA - lastB;
  }

  return timeOf(a.createdAt) - timeOf(b.createdAt);
}

export interface StudyQueueLimits {
  /** Tarjetas nuevas que todavía puede Introducir el usuario hoy (RF-003). */
  newRemaining: number;
  /** Repasos (aprendizaje + repaso) que todavía puede introducir hoy (RF-003). */
  reviewRemaining: number;
  /** Tope de tarjetas por sesión. */
  maxCards: number;
}

export interface LimitedQueue {
  /** Tarjetas admitidas, ya ordenadas. */
  accepted: StudyQueueCandidate[];
  /** Repartos finales por cubo. */
  counts: StudyQueueCounts;
  /** Tarjetas descartadas por los límites diarios. */
  skippedByLimits: number;
}

/**
 * Aplica los límites diarios del usuario (RF-003) y el tope por sesión.
 *
 * El modo cram (RF-022) ignora los límites diarios —no consume la cuota del día
 * porque tampoco programa nada— pero respeta el tope por sesión para no cargar un
 * mazo entero en el navegador.
 */
export function limitQueue(
  candidates: readonly StudyQueueCandidate[],
  limits: StudyQueueLimits,
  options: { ignoreDailyLimits: boolean }
): LimitedQueue {
  const ordered = [...candidates].sort(compareQueueOrder);
  const newQuota = options.ignoreDailyLimits ? Number.POSITIVE_INFINITY : Math.max(0, limits.newRemaining);
  const reviewQuota = options.ignoreDailyLimits ? Number.POSITIVE_INFINITY : Math.max(0, limits.reviewRemaining);
  const maxCards = Math.max(1, limits.maxCards);

  const accepted: StudyQueueCandidate[] = [];
  let newUsed = 0;
  let reviewUsed = 0;
  let skippedByLimits = 0;

  for (const candidate of ordered) {
    if (accepted.length >= maxCards) {
      skippedByLimits += 1;
      continue;
    }

    const bucket = bucketForStatus(candidate.status);

    if (bucket === "new") {
      if (newUsed >= newQuota) {
        skippedByLimits += 1;
        continue;
      }

      newUsed += 1;
    } else {
      if (reviewUsed >= reviewQuota) {
        skippedByLimits += 1;
        continue;
      }

      reviewUsed += 1;
    }

    accepted.push(candidate);
  }

  return {
    accepted,
    counts: countBuckets(accepted.map((candidate) => candidate.status)),
    skippedByLimits,
  };
}

/** Porcentaje de acierto: (Good + Easy) / Total (RF-015). */
export function toAccuracy(again: number, hard: number, good: number, easy: number): number {
  const total = again + hard + good + easy;

  if (total === 0) {
    return 0;
  }

  return Math.round(((good + easy) / total) * 1000) / 10;
}