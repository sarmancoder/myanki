import type { CardStatus } from "@/constants/cards";
import type { SrsAlgorithm, SrsRating } from "@/constants/srs";

export interface SrsSettingsView {
  algorithm: SrsAlgorithm;
  initialEaseFactor: number;
  minimumEaseFactor: number;
  maxIntervalDays: number;
  /** Escalera de aprendizaje en minutos (p. ej. `[1, 10]`). */
  learningSteps: number[];
  /** Escalera de reaprendizaje en minutos (p. ej. `[10]`). */
  relearningSteps: number[];
  updatedAt: string;
}

export interface SrsSettingsResult {
  settings: SrsSettingsView;
}

export interface SrsSettingsUpdateResult {
  settings: SrsSettingsView;
}

export interface SrsRatingPreview {
  rating: SrsRating;
  status: CardStatus;
  easeFactor: number;
  intervalDays: number;
  delayMinutes: number;
  intervalLabel: string;
  dueDate: string;
}

/** Entrada de `srs.review`, ya validada por `srsReviewInputSchema`. */
export interface SrsReviewInput {
  cardId: string;
  rating: SrsRating;
  timeSpentMs?: number;
  studySessionId?: string;
}

export interface SrsCalculateResult {
  previews: SrsRatingPreview[];
  /** La tarjeta acumula más lapses de los recomendados (RF-017). */
  shouldReviewCard: boolean;
}

export interface SrsReviewResult {
  cardId: string;
  status: CardStatus;
  easeFactor: number;
  intervalDays: number;
  delayMinutes: number;
  intervalLabel: string;
  dueDate: string;
  repetitions: number;
  lapses: number;
  shouldReviewCard: boolean;
}

export interface SrsDueCardItem {
  cardId: string;
  status: CardStatus;
  dueDate: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  shouldReviewCard: boolean;
}

export interface SrsDueCounts {
  new: number;
  learning: number;
  review: number;
  relearning: number;
  dueToday: number;
}

export interface SrsDueCardsResult {
  cards: SrsDueCardItem[];
  counts: SrsDueCounts;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}