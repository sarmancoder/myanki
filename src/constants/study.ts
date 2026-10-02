import type { SrsRating } from "@/constants/srs";

/**
 * Estados de una sesión de estudio. Se guardan en `study_sessions.status`:
 *
 * - `active`: la cola se está recorriendo (RF-019).
 * - `paused`: la tarjeta actual se conserva para retomarla (RF-019, RF-020).
 * - `completed`: la sesión terminó y ya no se puede calificar más (RF-015).
 */
export const STUDY_SESSION_STATUSES = ["active", "paused", "completed"] as const;

export type StudySessionStatus = (typeof STUDY_SESSION_STATUSES)[number];

/** Columna que suma cada calificación en los contadores de la sesión y del día. */
export const STUDY_RATING_COUNTER_FIELD: Record<SrsRating, "againCount" | "hardCount" | "goodCount" | "easyCount"> = {
  again: "againCount",
  hard: "hardCount",
  good: "goodCount",
  easy: "easyCount",
};

export function isStudySessionStatus(value: string): value is StudySessionStatus {
  return (STUDY_SESSION_STATUSES as readonly string[]).includes(value);
}

/**
 * Días de adelanto que se ofrecen en el estudio anticipado (RF-017). El 0
 * significa "solo las que vencen hoy", que es el comportamiento normal.
 */
export const STUDY_EARLY_DAY_OPTIONS = [0, 1, 2, 3, 7, 14, 30] as const;

/** Etiquetas de las opciones de estudio anticipado. */
export const STUDY_EARLY_DAY_LABELS: Record<number, string> = {
  0: "Solo hoy",
  1: "Hasta mañana",
  2: "En 2 días",
  3: "En 3 días",
  7: "En 1 semana",
  14: "En 2 semanas",
  30: "En 1 mes",
};

/** Tope de tarjetas por sesión, para no cargar un mazo entero en el navegador. */
export const DEFAULT_STUDY_MAX_CARDS = 200;
export const MIN_STUDY_MAX_CARDS = 10;
export const MAX_STUDY_MAX_CARDS = 1000;

/** Frecuencia de refresco del temporizador y de la cola de aprendizaje (RF-014). */
export const STUDY_TIMER_INTERVAL_MS = 1000;

/** Tamaño de página del historial de sesiones (RF de `/study/history`). */
export const STUDY_HISTORY_PAGE_SIZE = 20;
export const STUDY_HISTORY_PAGE_SIZES = [20, 50, 100] as const;

/** Días de historial diario que se piden para el resumen del panel (RF-015, módulo de estadísticas). */
export const STUDY_DAILY_STATS_DAYS = 14;

/** Etiquetas de los contadores por tipo de tarjeta del contador de sesión (RF-012). */
export const STUDY_COUNT_LABELS = {
  new: "Nuevas",
  learning: "En aprendizaje",
  review: "Repasos",
} as const;

export type StudyCountBucket = keyof typeof STUDY_COUNT_LABELS;

export const STUDY_STATUS_LABELS: Record<StudySessionStatus, string> = {
  active: "En curso",
  paused: "En pausa",
  completed: "Finalizada",
};

/** Traduce el estado del SRS al cubo del contador de sesión. */
export const STUDY_STATUS_TO_BUCKET: Record<string, StudyCountBucket> = {
  new: "new",
  learning: "learning",
  relearning: "learning",
  review: "review",
};