import { serverClient } from "@/server/client";
import DeckStudyPage from "./DeckStudyPage";
import type { DeckSummary, DeckOption } from "@/types/deck";

interface DeckStudyPageDataProps {
  deck: DeckSummary;
  ancestors: DeckOption[];
}

/**
 * Segunda fase de carga de la pantalla de estudio del mazo: la ficha del mazo ya
 * la resolvió `page.tsx` (para el 404) y aquí se cargan todas sus tarjetas.
 */
export default async function DeckStudyPageData({ deck, ancestors }: DeckStudyPageDataProps) {
  const cards = await serverClient.study.deckCards({ deckId: deck.id });

  return <DeckStudyPage deck={deck} ancestors={ancestors} cards={cards} />;
}