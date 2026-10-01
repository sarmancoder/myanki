import type { CardColorTag, CardStatus, CardStatusFilter, CardType } from "@/constants/cards";

export type { CardColorTag, CardStatus, CardStatusFilter, CardType };

/** Campos personalizados de la tarjeta. Siempre valores de texto. */
export type CardExtraFields = Record<string, string>;

export interface CardSchedulingView {
  status: CardStatus;
  /** Días hasta el próximo repaso (0 para tarjetas nuevas). */
  intervalDays: number;
  /** Fecha (ISO) en la que vuelve a tocar repasar. */
  dueDate: string;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: string | null;
}

export interface CardDeckRef {
  id: string;
  name: string;
  slug: string;
}

export interface CardListItem {
  id: string;
  deck: CardDeckRef;
  cardType: CardType;
  front: string;
  back: string;
  extraFields: CardExtraFields;
  imageUrl: string | null;
  audioUrl: string | null;
  isSuspended: boolean;
  colorTag: CardColorTag | null;
  createdAt: string;
  updatedAt: string;
  scheduling: CardSchedulingView;
}

export interface CardDetail extends CardListItem {
  /** Historial de repasos (más reciente primero). */
  reviews: CardReviewView[];
}

export interface CardReviewView {
  id: string;
  rating: string;
  reviewedAt: string;
  intervalBefore: number | null;
  intervalAfter: number | null;
}

export type CardSort = "createdAt" | "front" | "interval";
export type SortOrder = "asc" | "desc";

export interface CardListFilters {
  search: string | null;
  status: CardStatusFilter;
  sort: CardSort;
  order: SortOrder;
  page: number;
  pageSize: number;
}

export interface CardListResult {
  cards: CardListItem[];
  /** Total de tarjetas del mazo, sin aplicar búsqueda ni filtros. */
  deckTotalCards: number;
  /** Total de tarjetas que casan con los filtros activos. */
  totalCards: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** Recuento por estado del mazo completo (ignora búsqueda y filtro de estado). */
  statusCounts: Record<CardStatusFilter, number>;
}

export interface DeckOptionRef {
  id: string;
  name: string;
  slug: string;
}

export interface CardMutationResult {
  card: CardListItem;
}

export interface BatchCreateResult {
  created: number;
  /** Líneas que no se pudieron interpretar. */
  failed: { line: number; message: string }[];
  cards: CardListItem[];
}

export interface BatchDeleteResult {
  deleted: number;
}

export interface BatchSuspendResult {
  updated: number;
}

export interface CardMoveResult {
  card: CardListItem;
  deck: CardDeckRef;
}

export interface UploadMediaResult {
  url: string;
  bytes: number;
}