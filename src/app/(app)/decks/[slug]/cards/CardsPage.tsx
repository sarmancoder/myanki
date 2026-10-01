"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CardFilters from "@/components/cards/CardFilters";
import CardList from "@/components/cards/CardList";
import CardPagination from "@/components/cards/CardPagination";
import BatchCardsDialog from "@/components/cards/BatchCardsDialog";
import { formatNumber } from "@/lib/format";
import type { CardListResult, CardListFilters } from "@/types/card";
import type { DeckOption } from "@/types/deck";
import type { CardsPageDeck } from "./CardsPageData";

interface CardsPageProps {
  result: CardListResult;
  filters: CardListFilters;
  deck: CardsPageDeck;
  ancestors: DeckOption[];
}

interface StatCardProps {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
}

function StatCard({ label, value, hint, accent = false }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-blue-600" : "text-primary"}`}>
        {formatNumber(value)}
      </p>
      <p className="mt-1 text-xs text-secondary-foreground">{hint}</p>
    </div>
  );
}

export default function CardsPage({ result, filters, deck, ancestors }: CardsPageProps) {
  const router = useRouter();
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleChanged(message: string) {
    setToast({ type: "success", text: message });
    router.refresh();
  }

  function handleBatchCreated(batchResult: { created: number; failed: { line: number; message: string }[] }) {
    setIsBatchOpen(false);

    if (batchResult.failed.length > 0) {
      setToast({
        type: "error",
        text: `${batchResult.created} creadas, ${batchResult.failed.length} línea(s) con errores.`,
      });
    } else {
      setToast({ type: "success", text: `${batchResult.created} tarjetas creadas` });
    }

    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="space-y-3">
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
            <Link href={`/decks/${deck.slug}`} className="hover:underline">
              {deck.name}
            </Link>
          </span>
          <span className="flex items-center gap-1">
            <span>/</span>
            <span className="font-medium text-primary">Tarjetas</span>
          </span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-primary sm:text-3xl">Tarjetas</h1>
              {deck.isArchived && (
                <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  Mazo archivado
                </span>
              )}
            </div>
            <p className="text-sm text-secondary-foreground">
              Tarjetas de <strong className="font-medium text-primary">{deck.name}</strong>. Crea, edita, ordena y
              suspende sin salir del mazo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBatchOpen(true)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
            >
              Crear en lote
            </button>
            <Link
              href={`/decks/${deck.slug}/cards/new`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Nueva tarjeta
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Totales" value={result.deckTotalCards} hint="En este mazo" />
        <StatCard
          label="Nuevas"
          value={result.statusCounts.new}
          hint="Sin estudiar todavía"
          accent={result.statusCounts.new > 0}
        />
        <StatCard
          label="Aprendidas"
          value={result.statusCounts.review}
          hint="Intervalo mayor de un día"
        />
        <StatCard
          label="Suspendidas"
          value={result.statusCounts.suspended}
          hint="Excluidas del estudio"
          accent={result.statusCounts.suspended > 0}
        />
      </section>

      <CardFilters
        filters={filters}
        statusCounts={result.statusCounts}
        totalCards={result.totalCards}
        deckTotalCards={result.deckTotalCards}
      />

      <CardList
        cards={result.cards}
        deckId={deck.id}
        deckSlug={deck.slug}
        deckName={deck.name}
        onChanged={handleChanged}
      />

      <CardPagination
        page={result.page}
        totalPages={result.totalPages}
        pageSize={result.pageSize}
        totalCards={result.totalCards}
      />

      {isBatchOpen && (
        <BatchCardsDialog
          isOpen
          deckId={deck.id}
          deckName={deck.name}
          onClose={() => setIsBatchOpen(false)}
          onCreated={handleBatchCreated}
        />
      )}

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