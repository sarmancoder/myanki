import { Suspense } from "react";
import { notFound } from "next/navigation";
import { parseCardFilters } from "@/lib/cards/filters";
import { serverClient } from "@/server/client";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";
import CardsPageData, { type CardsPageDeck } from "./CardsPageData";

interface CardsRouteProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CardsRoute({ params, searchParams }: CardsRouteProps) {
  const { slug } = await params;
  const query = await searchParams;

  const detail = await serverClient.decks.detail({ slug }).catch(() => null);

  if (!detail) {
    notFound();
  }

  const deck: CardsPageDeck = {
    id: detail.deck.id,
    name: detail.deck.name,
    slug: detail.deck.slug,
    languageCode: detail.deck.languageCode,
    isArchived: detail.deck.isArchived,
  };

  return (
    <Suspense fallback={<DashboardSkeleton cards={4} />}>
      <CardsPageData deck={deck} ancestors={detail.ancestors} filters={parseCardFilters(query)} />
    </Suspense>
  );
}