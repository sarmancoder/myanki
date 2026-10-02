import type { CardStatus } from "@/constants/cards";
import { STUDY_STATUS_TO_BUCKET, type StudyCountBucket } from "@/constants/study";
import type { StudyQueueCounts } from "@/types/study";

/**
 * Tarjeta candidata a entrar en la cola de una sesión. La construye el router a
 * partir de Prisma con lo mínimo que hace falta para ordenarla.
 */
export interface StudyQueueCandidate {
  cardId: string;
  status: CardStatus;
  /**
   * Cuántas veces se ha estudiado ya la tarjeta (`repetitions + lapses`). Es la
   * clave del orden de estudio: primero salen las que menos se han estudiado.
   */
  studyCount: number;
}

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

/**
 * Mezcla de Fisher-Yates. Se usa para desempatar de forma aleatoria: el orden de
 * las tarjetas que tienen el mismo número de estudios cambia en cada sesión, de
 * modo que no se repita siempre la misma secuencia.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = result[index];

    result[index] = result[swapIndex];
    result[swapIndex] = current;
  }

  return result;
}

/**
 * Orden de la cola de una sesión: primero las tarjetas que menos se han
 * estudiado y, dentro de cada grupo, orden aleatorio.
 *
 * Se mezcla antes de ordenar a propósito. `Array.prototype.sort` es estable, así
 * que el orden aleatorio previo se conserva entre las tarjetas que empatan en
 * `studyCount`: las menos estudiadas siempre van primero, pero nunca en el mismo
 * orden dentro de un grupo.
 */
export function orderStudyQueue(
  candidates: readonly StudyQueueCandidate[]
): StudyQueueCandidate[] {
  return shuffle(candidates).sort((a, b) => a.studyCount - b.studyCount);
}

/** Porcentaje de acierto: (Good + Easy) / Total (RF-015). */
export function toAccuracy(again: number, hard: number, good: number, easy: number): number {
  const total = again + hard + good + easy;

  if (total === 0) {
    return 0;
  }

  return Math.round(((good + easy) / total) * 1000) / 10;
}