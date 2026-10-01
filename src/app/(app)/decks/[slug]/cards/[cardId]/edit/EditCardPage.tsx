"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardForm from "@/components/forms/CardForm";
import DeleteCardsDialog from "@/components/cards/DeleteCardsDialog";
import MoveCardsModal from "@/components/cards/MoveCardsModal";
import CardStatusBadge from "@/components/cards/CardStatusBadge";
import { getCardTypeLabel } from "@/constants/cards";
import { formatDate } from "@/lib/format";
import type { CardDetail } from "@/types/card";
import type { DeckOption } from "@/types/deck";

interface EditCardPageProps {
  card: CardDetail;
  deckSlug: string;
  deckName: string;
  ancestors: DeckOption[];
}

const RATING_LABELS: Record<string, string> = {
  again: "Otra vez",
  hard: "Difícil",
  good: "Bueno",
  easy: "Fácil",
};

/** Edición a pantalla completa con el historial de repasos de la tarjeta. */
export default function EditCardPage({ card, deckSlug, deckName, ancestors }: EditCardPageProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleSaved() {
    setToast({ type: "success", text: "Tarjeta actualizada" });
    router.refresh();
  }

  function handleDeleted() {
    setIsDeleteOpen(false);
    router.push(`/decks/${deckSlug}/cards`);
    router.refresh();
  }

  function handleMoved() {
    setIsMoveOpen(false);
    // Al moverla la tarjeta sale de este mazo, así que la lista vuelve al listado.
    router.push(`/decks/${deckSlug}/cards`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-secondary-foreground">
          <Link href="/decks" className="hover:underline">
            Mis mazos
          </Link>
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              <span>/</span>
              <Link href={`/decks/${ancestor.slug}`} className="hover:underline">
                {ancestor.name}
              </Link>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span>/</span>
            <Link href={`/decks/${deckSlug}/cards`} className="hover:underline">
              {deckName}
            </Link>
          </span>
          <span className="flex items-center gap-1">
            <span>/</span>
            <span className="font-medium text-primary">Editar</span>
          </span>
        </nav>

        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Editar tarjeta</h1>

        <div className="flex flex-wrap items-center gap-2 text-xs text-secondary-foreground">
          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground-foreground">
            {getCardTypeLabel(card.cardType)}
          </span>
          <CardStatusBadge status={card.isSuspended ? "suspended" : card.scheduling.status} long />
          <span>Creada: {formatDate(card.createdAt)}</span>
          <span>
            Repasos: {card.scheduling.repetitions} · Lapses: {card.scheduling.lapses}
          </span>
        </div>
      </header>

      <div className="rounded-lg border border-border bg-background p-6">
        <CardForm
          mode="edit"
          deckId={card.deck.id}
          initialValues={{
            id: card.id,
            cardType: card.cardType,
            front: card.front,
            back: card.back,
            extraFields: card.extraFields,
            imageUrl: card.imageUrl,
            audioUrl: card.audioUrl,
            colorTag: card.colorTag,
            isSuspended: card.isSuspended,
          }}
          onSuccess={handleSaved}
          onCancel={() => router.push(`/decks/${deckSlug}/cards`)}
        />
      </div>

      <section className="rounded-lg border border-border bg-background">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-primary">
          Historial de repasos ({card.reviews.length})
        </h2>

        {card.reviews.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-secondary-foreground">
            Esta tarjeta todavía no se ha estudiado.
          </p>
        ) : (
          <ul>
            {card.reviews.map((review) => (
              <li
                key={review.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs last:border-b-0"
              >
                <span className="font-medium text-primary">
                  {RATING_LABELS[review.rating] ?? review.rating}
                </span>
                <span className="text-secondary-foreground">
                  {formatDate(review.reviewedAt)} · intervalo {review.intervalBefore ?? "—"} →{" "}
                  {review.intervalAfter ?? "—"} días
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIsMoveOpen(true)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
        >
          Mover a otro mazo
        </button>
        <button
          type="button"
          onClick={() => setIsDeleteOpen(true)}
          className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
        >
          Eliminar tarjeta
        </button>
      </section>

      {isDeleteOpen && (
        <DeleteCardsDialog
          isOpen
          cards={[card]}
          onClose={() => setIsDeleteOpen(false)}
          onDeleted={handleDeleted}
        />
      )}

      {isMoveOpen && (
        <MoveCardsModal
          isOpen
          cardIds={[card.id]}
          currentDeckId={card.deck.id}
          currentDeckName={deckName}
          onClose={() => setIsMoveOpen(false)}
          onMoved={handleMoved}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-green-500 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 shadow-lg"
          role="status"
        >
          {toast.text}
          <button type="button" onClick={() => setToast(null)} aria-label="Cerrar aviso" className="font-bold">
            ×
          </button>
        </div>
      )}
    </div>
  );
}