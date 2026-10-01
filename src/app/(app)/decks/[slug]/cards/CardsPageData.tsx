import { serverClient } from "@/server/client";
import CardsPage from "./CardsPage";
import type { CardListFilters } from "@/types/card";
import type { DeckOption } from "@/types/deck";

export interface CardsPageDeck {
  id: string;
  name: string;
  slug: string;
  languageCode: string;
  isArchived: boolean;
}

interface CardsPageDataProps {
  deck: CardsPageDeck;
  ancestors: DeckOption[];
  filters: CardListFilters;
}

/**
 * Segunda fase de carga del listado: `page.tsx` resuelve antes el mazo (para poder
 * responder 404 si no existe) y aquí se lanzan las tarjetas con los filtros de la
 * query string, envueltos en el `<Suspense>` de la página.
 */
export default async function CardsPageData({ deck, ancestors, filters }: CardsPageDataProps) {
  const result = await serverClient.cards.list({
    deckId: deck.id,
    search: filters.search ?? undefined,
    status: filters.status,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  return <CardsPage result={result} filters={filters} deck={deck} ancestors={ancestors} />;
}