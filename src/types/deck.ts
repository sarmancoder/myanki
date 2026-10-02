import type { LanguageRef, LanguageView } from "@/types/language";

export type { LanguageRef, LanguageView };

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
  /** Idioma del mazo; `null` si se borró del catálogo. */
  language: LanguageRef | null;
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
  language: LanguageRef | null;
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
  language: LanguageRef | null;
  depth: number;
  canHaveChildren: boolean;
}

export interface DeckListFilters {
  /** Id del idioma por el que se filtra, o `null` para no filtrar. */
  languageId: string | null;
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