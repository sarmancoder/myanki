import type { CardStatus, CardType } from "@/constants/cards";
import type { SrsRating } from "@/constants/srs";
import type { StudyCountBucket, StudySessionStatus } from "@/constants/study";
import type { CardColorTag, CardExtraFields } from "@/types/card";

/**
 * Estado del scheduling que el módulo de estudio necesita para calcular en el
 * navegador los intervalos que se pintan en los botones de calificación (RF-009).
 * Es una copia del momento en que la tarjeta entró en la cola.
 */
export interface StudyCardSchedulingView {
  status: CardStatus;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
}

/** Tarjeta completa que viaja al cliente al empezar o al retomar una sesión. */
export interface StudyCardView {
  id: string;
  deckId: string;
  deckName: string;
  cardType: CardType;
  front: string;
  back: string;
  extraFields: CardExtraFields;
  imageUrl: string | null;
  audioUrl: string | null;
  colorTag: CardColorTag | null;
  scheduling: StudyCardSchedulingView;
}

/** Cola pendiente de una sesión: ids de tarjeta y su estado en el SRS. */
export interface StudyQueueItemView {
  cardId: string;
  status: CardStatus;
  /** Cubo del contador de sesión al que pertenece la tarjeta (RF-012). */
  bucket: StudyCountBucket;
}

/** Recuento de tarjetas pendientes por tipo (RF-012). */
export interface StudyQueueCounts {
  new: number;
  learning: number;
  review: number;
  /** Total de tarjetas que quedan por calificar en la sesión. */
  remaining: number;
}

export interface StudySessionView {
  id: string;
  /** `null` cuando la sesión study "Todos los mazos" (RF-001). */
  deckId: string | null;
  deckName: string | null;
  status: StudySessionStatus;
  isCramMode: boolean;
  /** Días de adelanto del estudio anticipado (0 = solo vencidas hoy). */
  earlyDays: number;
  startedAt: string;
  endedAt: string | null;
  /** Tiempo de estudio acumulado en las fases activas, en milisegundos. */
  elapsedMs: number;
  totalCards: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  totalTimeSpentMs: number;
  isCompleted: boolean;
  /** Tarjeta que se estaba mostrando al pausar (RF-019). */
  currentCardId: string | null;
  counts: StudyQueueCounts;
  /** Calificación media ponderada, en porcentaje (RF-015). */
  accuracy: number;
}

/**
 * Estado completo de una sesión de estudio. Es lo que recibe la interfaz de
 * tarjetas y lo que se reconstruye al reanudar (RF-020, RF-021).
 */
export interface StudySessionState {
  session: StudySessionView;
  cards: StudyCardView[];
  /** Cola pendiente, en orden de estudio. */
  queue: StudyQueueItemView[];
  /**
   * Configuración efectiva del planificador, para calcular en el cliente los
   * intervalos de los cuatro botones (RF-009) sin pedirlo al servidor.
   */
  srsSettings: StudySrsScheduleSettings;
}

export interface StudySrsScheduleSettings {
  algorithm: "sm2" | "fsrs";
  initialEaseFactor: number;
  minimumEaseFactor: number;
  maxIntervalDays: number;
  learningSteps: number[];
  relearningSteps: number[];
}

/**
 * Respuesta de `study.start`. Cuando la cola queda vacía (RF-004) no se crea
 * sesión y `session` llega como `null`.
 */
export interface StudyStartResult {
  session: StudySessionView | null;
  cards: StudyCardView[];
  queue: StudyQueueItemView[];
  srsSettings: StudySrsScheduleSettings;
  isEmpty: boolean;
}

export interface StudyReviewResult {
  cardId: string;
  rating: SrsRating;
  /** Estado del SRS tras aplicar la calificación. */
  status: CardStatus;
  /** Intervalo estimado, listo para pintar ("10 min", "1 día"). */
  intervalLabel: string;
  /**
   * Momento exacto en el que la tarjeta vuelve a la cola de la sesión, o `null`
   * si ya no vuelve hoy (p. ej. una tarjeta graduada a "review").
   */
  nextDueAt: string | null;
  isCramMode: boolean;
  counts: StudyQueueCounts;
  /** `true` cuando no queda ninguna tarjeta por calificar (RF-015). */
  isFinished: boolean;
  /** Tiempo total transcurrido de la sesión, ya congelado al pausar. */
  elapsedMs: number;
}

export interface StudyPauseResult {
  session: StudySessionView;
}

/** Resumen de la sesión al terminarla (RF-015). */
export interface StudySummary {
  session: StudySessionView;
  /** Desglose por calificación. */
  breakdown: { rating: SrsRating; count: number }[];
  /** Porcentaje de respuestas correctas: (Good + Easy) / Total (RF-015). */
  accuracy: number;
  /** Tiempo total de la sesión ya cerrado, en milisegundos. */
  durationMs: number;
  /** Tiempo medio por respuesta, en milisegundos. */
  averageMsPerCard: number;
}

export interface StudyDeckOption {
  id: string;
  name: string;
  slug: string;
  /** Profundidad en la jerarquía, para sangrar el selector. */
  depth: number;
  isArchived: boolean;
  counts: StudyQueueCounts;
  /** Tarjetas que vencen en los próximos 7 días, para el estudio anticipado (RF-017). */
  upcoming: number;
}

/** Límites diarios configurados por el usuario (RF-003). */
export interface StudyLimits {
  maxNewCardsPerDay: number;
  maxReviewsPerDay: number;
  /** Tarjetas nuevas que quedan por hoy. */
  newRemaining: number;
  /** Repasos que quedan por hoy. */
  reviewRemaining: number;
}

/** Sesión abierta (activa o en pausa) que se puede retomar (RF-020, RF-021). */
export type StudyResumable = {
  session: StudySessionView;
  pendingCards: number;
} | null;

export interface StudyOverview {
  /** Totales de "Todos los mazos" (o del mazo seleccionado). */
  allDecks: StudyQueueCounts & { upcoming: number; totalCards: number };
  decks: StudyDeckOption[];
  limits: StudyLimits;
  /** Sesión activa o en pausa que se puede retomar (RF-020, RF-021). */
  resumable: StudyResumable;
}

export interface StudyHistoryEntry {
  id: string;
  deckName: string | null;
  startedAt: string;
  endedAt: string | null;
  totalCards: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  durationMs: number;
  accuracy: number;
  isCramMode: boolean;
  isCompleted: boolean;
}

export interface StudyHistoryResult {
  sessions: StudyHistoryEntry[];
  page: number;
  pageSize: number;
  totalSessions: number;
  totalPages: number;
  /** Totales del periodo paginado. */
  totals: {
    totalCards: number;
    durationMs: number;
    accuracy: number;
  };
}

export interface StudyDailyStatEntry {
  studyDate: string;
  totalCards: number;
  newCards: number;
  reviewCards: number;
  totalTimeSpentMs: number;
  againCount: number;
  hardCount: number;
  goodCount: number;
  easyCount: number;
  accuracy: number;
}

export interface StudyDailyStatsResult {
  days: StudyDailyStatEntry[];
  totals: {
    totalCards: number;
    newCards: number;
    reviewCards: number;
    totalTimeSpentMs: number;
    accuracy: number;
  };
  /** Días consecutivos con al menos una respuesta, contando hoy (RF del módulo de estadísticas). */
  currentStreak: number;
}