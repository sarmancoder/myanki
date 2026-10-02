import { serverClient } from "@/server/client";
import DecksPage from "./DecksPage";
import type { DeckListFilters } from "@/types/deck";

interface DecksPageDataProps {
  filters: DeckListFilters;
}

export default async function DecksPageData({ filters }: DecksPageDataProps) {
  // Los filtros de idioma necesitan el catálogo del usuario para pintar el selector.
  const [{ decks, totalDecks, matchingDecks }, { languages }] = await Promise.all([
    serverClient.decks.list({
      search: filters.search ?? undefined,
      languageId: filters.languageId ?? undefined,
      sort: filters.sort,
      order: filters.order,
      includeArchived: filters.includeArchived,
    }),
    serverClient.languages.list({}),
  ]);

  return (
    <DecksPage
      decks={decks}
      filters={filters}
      languages={languages}
      totalDecks={totalDecks}
      matchingDecks={matchingDecks}
    />
  );
}