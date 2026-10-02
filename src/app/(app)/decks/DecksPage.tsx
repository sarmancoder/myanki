"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DeckFilters from "@/components/decks/DeckFilters";
import DeckList from "@/components/decks/DeckList";
import ImportCardsDialog from "@/components/decks/ImportCardsDialog";
import type { DeckListFilters, DeckNode, ImportResult } from "@/types/deck";
import type { LanguageView } from "@/types/language";

interface DecksPageProps {
  decks: DeckNode[];
  filters: DeckListFilters;
  languages: LanguageView[];
  totalDecks: number;
  matchingDecks: number;
}

export default function DecksPage({
  decks,
  filters,
  languages,
  totalDecks,
  matchingDecks,
}: DecksPageProps) {
  const router = useRouter();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; deckSlug: string } | null>(null);

  function handleImported(result: ImportResult) {
    setIsImportOpen(false);
    setToast({
      text: `Importación completada: ${result.createdCards} creadas, ${result.updatedCards} actualizadas, ${result.skippedCards} omitidas.`,
      deckSlug: result.deckSlug,
    });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-primary sm:text-3xl">Mis mazos</h1>
          <p className="text-sm text-secondary-foreground">
            Organiza tus mazos por idioma y jerarquía, con sus estadísticas de estudio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Importar mazo
          </button>
          <Link
            href="/decks/new"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Nuevo mazo
          </Link>
        </div>
      </header>

      <DeckFilters
        filters={filters}
        languages={languages}
        totalDecks={totalDecks}
        matchingDecks={matchingDecks}
      />

      <DeckList decks={decks} hasSearch={Boolean(filters.search || filters.languageId)} />

      {isImportOpen && (
        <ImportCardsDialog
          isOpen
          onClose={() => setIsImportOpen(false)}
          onImported={handleImported}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-green-500 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 shadow-lg"
          role="status"
        >
          <span>{toast.text}</span>
          <Link href={`/decks/${toast.deckSlug}`} className="underline">
            Abrir mazo
          </Link>
          <button type="button" onClick={() => setToast(null)} aria-label="Cerrar aviso" className="font-bold">
            ×
          </button>
        </div>
      )}
    </div>
  );
}