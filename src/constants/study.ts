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

/**
 * Etiqueta del intervalo en las calificaciones del modo cram: no hay efecto real
 * porque el cram no programa nada (RF-023). La comparten el cliente, que la pinta
 * en los botones, y el servidor, que la devuelve al guardar.
 */
export const STUDY_CRAM_INTERVAL_LABEL = "Sin efecto";

export function isStudySessionStatus(value: string): value is StudySessionStatus {
  return (STUDY_SESSION_STATUSES as readonly string[]).includes(value);
}

/** Frecuencia de refresco del temporizador y de la cola de aprendizaje (RF-014). */
export const STUDY_TIMER_INTERVAL_MS = 1000;

/**
 * Tope de respuestas por lote. La interfaz de estudio calcula el SRS en el
 * navegador y envía todo junto al terminar la cola; el techo protege al servidor de
 * un envío absurdo sin estorbar a una sesión larga.
 */
export const STUDY_MAX_BATCH_ANSWERS = 2000;

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