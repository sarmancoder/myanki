import { serverClient } from "@/server/client";
import { STUDY_DAILY_STATS_DAYS } from "@/constants/study";
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
  const [{ decks }, stats] = await Promise.all([
    serverClient.decks.list({}),
    serverClient.study.dailyStats({ days: STUDY_DAILY_STATS_DAYS }),
  ]);

  const totals = decks.reduce<Totals>(
    (accumulator, deck) => ({
      decks: accumulator.decks + 1,
      cards: accumulator.cards + deck.aggregate.total,
      dueToday: accumulator.dueToday + deck.aggregate.dueToday,
      newCards: accumulator.newCards + deck.stats.new,
    }),
    { decks: 0, cards: 0, dueToday: 0, newCards: 0 }
  );

  // `days` viene en orden ascendente y solo incluye días con actividad, así que la
  // entrada de hoy es la última cuando existe.
  const lastDay = stats.days.at(-1);
  const isToday = lastDay?.studyDate === new Date().toISOString().slice(0, 10);

  return (
    <HomePage
      name={name}
      totals={totals}
      today={{
        totalCards: isToday ? (lastDay?.totalCards ?? 0) : 0,
        newCards: isToday ? (lastDay?.newCards ?? 0) : 0,
        reviewCards: isToday ? (lastDay?.reviewCards ?? 0) : 0,
        accuracy: isToday ? (lastDay?.accuracy ?? 0) : 0,
        streak: stats.currentStreak,
      }}
    />
  );
}