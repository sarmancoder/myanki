"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardForm from "@/components/forms/CardForm";
import type { CardListItem } from "@/types/card";
import type { DeckOption } from "@/types/deck";

interface NewCardPageProps {
  deckId: string;
  deckName: string;
  deckSlug: string;
  ancestors: DeckOption[];
}

/**
 * Alta de tarjetas. El formulario se mantiene abierto tras cada guardado cuando la
 * creación viene de Ctrl+Enter (RF-006), de modo que se pueden encadenar varias
 * tarjetas sin navegar.
 */
export default function NewCardPage({ deckId, deckName, deckSlug, ancestors }: NewCardPageProps) {
  const router = useRouter();
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleCreated(card: CardListItem, context: { keptOpen: boolean }) {
    if (context.keptOpen) {
      setToast({ type: "success", text: "Tarjeta guardada. Escribe la siguiente." });
    } else {
      setToast({ type: "success", text: "Tarjeta creada" });
      router.push(`/decks/${card.deck.slug}/cards`);
    }

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
            <Link href={`/decks/${deckSlug}`} className="hover:underline">
              {deckName}
            </Link>
          </span>
          <span className="flex items-center gap-1">
            <span>/</span>
            <span className="font-medium text-primary">Nueva tarjeta</span>
          </span>
        </nav>

        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Nueva tarjeta</h1>
        <p className="text-sm text-secondary-foreground">
          Se añadirá al mazo <strong className="font-medium text-primary">{deckName}</strong>. El anverso y el
          reverso admiten Markdown; pulsa <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">Ctrl+Enter</kbd> para
          guardar y pasar directamente a la siguiente.
        </p>
      </header>

      <div className="rounded-lg border border-border bg-background p-6">
        <CardForm
          mode="create"
          deckId={deckId}
          enableQuickCreate
          onSuccess={handleCreated}
          onCancel={() => router.back()}
        />
      </div>

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-red-500 bg-red-50 text-red-700"
          }`}
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