import { notFound } from "next/navigation";
import { serverClient } from "@/server/client";
import NewCardPage from "./NewCardPage";

interface NewCardRouteProps {
  params: Promise<{ slug: string }>;
}

export default async function NewCardRoute({ params }: NewCardRouteProps) {
  const { slug } = await params;

  const detail = await serverClient.decks.detail({ slug }).catch(() => null);

  if (!detail) {
    notFound();
  }

  return (
    <NewCardPage
      deckId={detail.deck.id}
      deckName={detail.deck.name}
      deckSlug={detail.deck.slug}
      deckLanguage={detail.deck.language}
      ancestors={detail.ancestors}
    />
  );
}