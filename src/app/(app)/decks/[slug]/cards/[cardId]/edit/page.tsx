import { notFound } from "next/navigation";
import { serverClient } from "@/server/client";
import EditCardPage from "./EditCardPage";

interface EditCardRouteProps {
  params: Promise<{ slug: string; cardId: string }>;
}

export default async function EditCardRoute({ params }: EditCardRouteProps) {
  const { slug, cardId } = await params;

  const [detail, card] = await Promise.all([
    serverClient.decks.detail({ slug }).catch(() => null),
    serverClient.cards.detail({ id: cardId }).catch(() => null),
  ]);

  // El mazo de la URL manda: editar una tarjeta desde otro mazo sería confuso y
  // permitiría escribir en un mazo distinto del que muestra el breadcrumb.
  if (!detail || !card || card.deck.id !== detail.deck.id) {
    notFound();
  }

  return (
    <EditCardPage
      card={card}
      deckSlug={detail.deck.slug}
      deckName={detail.deck.name}
      ancestors={detail.ancestors}
    />
  );
}