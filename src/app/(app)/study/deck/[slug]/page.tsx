import { Suspense } from "react";
import { notFound } from "next/navigation";
import { serverClient } from "@/server/client";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";
import DeckStudyPageData from "./DeckStudyPageData";

interface DeckStudyRouteProps {
  params: Promise<{ slug: string }>;
}

export default async function DeckStudyRoute({ params }: DeckStudyRouteProps) {
  const { slug } = await params;

  const detail = await serverClient.decks.detail({ slug }).catch(() => null);

  if (!detail) {
    notFound();
  }

  return (
    <Suspense fallback={<DashboardSkeleton cards={4} />}>
      <DeckStudyPageData deck={detail.deck} ancestors={detail.ancestors} />
    </Suspense>
  );
}