import { notFound } from "next/navigation";
import { serverClient } from "@/server/client";
import DeckDetailPage from "./DeckDetailPage";

interface DeckDetailRouteProps {
  params: Promise<{ slug: string }>;
}

export default async function DeckDetail({ params }: DeckDetailRouteProps) {
  const { slug } = await params;

  const detail = await serverClient.decks.detail({ slug }).catch(() => null);

  if (!detail) {
    notFound();
  }

  return (
    <DeckDetailPage
      deck={detail.deck}
      ancestors={detail.ancestors}
      subDecks={detail.subDecks}
      impact={detail.impact}
      canHaveChildren={detail.canHaveChildren}
    />
  );
}