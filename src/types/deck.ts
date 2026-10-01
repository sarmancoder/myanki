import type { LanguageCode } from "@/constants/languages";

export interface DeckStatsView {
  /** Tarjetas propias del mazo (excluye sub-mazos), no suspendidas. */
  total: number;
  new: number;
  learning: number;
  review: number;
  dueToday: number;
}

export interface DeckAggregateView extends DeckStatsView {
  /** Tarjetas del mazo y de todos sus descendientes. */
  subdeckCount: number;
}

export interface DeckNode {
  id: string;
  parentDeckId: string | null;
  name: string;
  slug: string;
  description: string | null;
  languageCode: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastStudiedAt: string | null;
  /** 1 = mazo raíz, 3 = profundidad máxima permitida. */
  depth: number;
  /** Indica si el mazo cumple los filtros de búsqueda/idioma activos. */
  isMatch: boolean;
  stats: DeckStatsView;
  aggregate: DeckAggregateView;
  children: DeckNode[];
}

export interface DeckSummary {
  id: string;
  parentDeckId: string | null;
  name: string;
  slug: string;
  description: string | null;
  languageCode: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastStudiedAt: string | null;
  depth: number;
  stats: DeckStatsView;
  aggregate: DeckAggregateView;
}

export interface DeckOption {
  id: string;
  name: string;
  slug: string;
  languageCode: string;
  depth: number;
  canHaveChildren: boolean;
}

export interface DeckListFilters {
  language: LanguageCode | null;
  search: string | null;
  sort: "name" | "createdAt" | "cards";
  order: "asc" | "desc";
  includeArchived: boolean;
}

export interface DeckListResult {
  decks: DeckNode[];
  totalDecks: number;
  matchingDecks: number;
}

export interface DeckDeleteImpact {
  deckCount: number;
  cardCount: number;
}

export interface DeckDetailResult {
  deck: DeckSummary;
  ancestors: DeckOption[];
  subDecks: DeckNode[];
  impact: DeckDeleteImpact;
  canHaveChildren: boolean;
}

export interface ImportResult {
  deckId: string;
  deckSlug: string;
  createdDeck: boolean;
  createdCards: number;
  updatedCards: number;
  skippedCards: number;
}