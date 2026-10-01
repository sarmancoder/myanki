import { serverClient } from "@/server/client";
import HomePage from "./HomePage";

interface HomePageDataProps {
  name: string;
}

interface Totals {
  decks: number;
  cards: number;
  dueToday: number;
  newCards: number;
}

export default async function HomePageData({ name }: HomePageDataProps) {
  const { decks } = await serverClient.decks.list({});

  const totals = decks.reduce<Totals>(
    (accumulator, deck) => ({
      decks: accumulator.decks + 1,
      cards: accumulator.cards + deck.aggregate.total,
      dueToday: accumulator.dueToday + deck.aggregate.dueToday,
      newCards: accumulator.newCards + deck.stats.new,
    }),
    { decks: 0, cards: 0, dueToday: 0, newCards: 0 }
  );

  return <HomePage name={name} totals={totals} />;
}