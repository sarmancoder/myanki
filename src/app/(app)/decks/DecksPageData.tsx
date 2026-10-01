import { serverClient } from "@/server/client";
import DecksPage from "./DecksPage";
import type { DeckListFilters } from "@/types/deck";

interface DecksPageDataProps {
  filters: DeckListFilters;
}

export default async function DecksPageData({ filters }: DecksPageDataProps) {
  const { decks, totalDecks, matchingDecks } = await serverClient.decks.list({
    search: filters.search ?? undefined,
    language: filters.language ?? undefined,
    sort: filters.sort,
    order: filters.order,
    includeArchived: filters.includeArchived,
  });

  return (
    <DecksPage
      decks={decks}
      filters={filters}
      totalDecks={totalDecks}
      matchingDecks={matchingDecks}
    />
  );
}