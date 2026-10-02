"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DeckEditorModal from "@/components/decks/DeckEditorModal";
import DeleteDeckDialog from "@/components/decks/DeleteDeckDialog";
import ImportCardsDialog from "@/components/decks/ImportCardsDialog";
import ExportDeckButtons from "@/components/decks/ExportDeckButtons";
import { deckOptionsAction, listLanguagesAction, setDeckArchivedAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { formatDate, formatNumber } from "@/lib/format";
import { MAX_DECK_DEPTH } from "@/lib/validation/deck";
import type {
  DeckDeleteImpact,
  DeckNode,
  DeckOption,
  DeckSummary,
  ImportResult,
} from "@/types/deck";
import type { LanguageView } from "@/types/language";

interface DeckDetailPageProps {
  deck: DeckSummary;
  ancestors: DeckOption[];
  subDecks: DeckNode[];
  impact: DeckDeleteImpact;
  canHaveChildren: boolean;
}

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}

function StatCard({ label, value, hint, accent = false }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-blue-600" : "text-primary"}`}>{value}</p>
      <p className="mt-1 text-xs text-secondary-foreground">{hint}</p>
    </div>
  );
}

export default function DeckDetailPage({
  deck,
  ancestors,
  subDecks,
  impact,
  canHaveChildren,
}: DeckDetailPageProps) {
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [parentOptions, setParentOptions] = useState<DeckOption[]>([]);
  const [languages, setLanguages] = useState<LanguageView[]>([]);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleOpenEdit() {
    setIsEditOpen(true);
    const [optionsResult, languagesResult] = await Promise.all([
      deckOptionsAction({ excludeDeckId: deck.id }),
      listLanguagesAction(),
    ]);

    if (isSuccess(optionsResult)) {
      setParentOptions(optionsResult[0].options);
    } else if (isError(optionsResult)) {
      setToast({ type: "error", text: optionsResult[1].message });
    }

    if (isSuccess(languagesResult)) {
      setLanguages(languagesResult[0].languages);
    }
  }

  async function handleToggleArchive() {
    setIsBusy(true);

    const result = await setDeckArchivedAction({ id: deck.id, isArchived: !deck.isArchived });

    setIsBusy(false);

    if (isError(result)) {
      setToast({ type: "error", text: getErrorMessage(result[1].message, "No se pudo actualizar el mazo") });
      return;
    }

    setToast({
      type: "success",
      text: deck.isArchived ? "Mazo desarchivado" : "Mazo archivado. No aparecerá en el estudio.",
    });
    router.refresh();
  }

  function handleSaved(updatedDeck: DeckSummary) {
    setIsEditOpen(false);
    setToast({ type: "success", text: "Mazo actualizado" });

    if (updatedDeck.slug !== deck.slug) {
      router.push(`/decks/${updatedDeck.slug}`);
    }

    router.refresh();
  }

  function handleDeleted() {
    setIsDeleteOpen(false);
    router.push("/decks");
    router.refresh();
  }

  function handleImported(result: ImportResult) {
    setIsImportOpen(false);
    setToast({
      type: "success",
      text: `Importación completada: ${result.createdCards} creadas, ${result.updatedCards} actualizadas, ${result.skippedCards} omitidas.`,
    });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
            <span className="font-medium text-primary">{deck.name}</span>
          </span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-primary sm:text-3xl">{deck.name}</h1>
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground-foreground">
                {deck.language
                  ? `${deck.language.flag ? `${deck.language.flag} ` : ""}${deck.language.name}`
                  : "Sin idioma"}
              </span>
              {deck.isArchived && (
                <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                  Archivado
                </span>
              )}
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground-foreground">
                Nivel {deck.depth} de {MAX_DECK_DEPTH}
              </span>
            </div>

            {deck.description && <p className="max-w-2xl text-sm text-secondary-foreground">{deck.description}</p>}

            <p className="text-xs text-secondary-foreground">
              Creado el {formatDate(deck.createdAt)} · Último estudio: {formatDate(deck.lastStudiedAt)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href={`/study/deck/${deck.slug}`}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Estudiar
              </Link>

              {canHaveChildren && (
                <Link
                  href={`/decks/new?parent=${deck.id}`}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary"
                >
                  + Sub-mazo
                </Link>
              )}

              <button
                type="button"
                onClick={handleOpenEdit}
                disabled={isBusy}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
              >
                Editar
              </button>

              <button
                type="button"
                onClick={handleToggleArchive}
                disabled={isBusy}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
              >
                {deck.isArchived ? "Desarchivar" : "Archivar"}
              </button>

              <button
                type="button"
                onClick={() => setIsDeleteOpen(true)}
                disabled={isBusy}
                title={`Se eliminarán ${formatNumber(impact.deckCount)} mazo(s) y ${formatNumber(impact.cardCount)} tarjeta(s)`}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>

            <ExportDeckButtons deckId={deck.id} />
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tarjetas"
          value={formatNumber(deck.aggregate.total)}
          hint={
            deck.aggregate.subdeckCount > 0
              ? `Incluye ${formatNumber(deck.aggregate.subdeckCount)} sub-mazo(s)`
              : "Solo este mazo"
          }
        />
        <StatCard
          label="Nuevas"
          value={formatNumber(deck.stats.new)}
          hint="Sin estudiar todavía"
        />
        <StatCard
          label="Pendientes hoy"
          value={formatNumber(deck.aggregate.dueToday)}
          hint="Repasos programados"
          accent={deck.aggregate.dueToday > 0}
        />
        <StatCard
          label="Último estudio"
          value={deck.lastStudiedAt ? formatDate(deck.lastStudiedAt) : "Nunca"}
          hint="Última sesión de estudio"
        />
      </section>

      <section className="rounded-lg border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-primary">
            Sub-mazos ({subDecks.length})
          </h2>
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary"
          >
            Importar tarjetas
          </button>
        </div>

        {subDecks.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-secondary-foreground">
            Este mazo todavía no tiene sub-mazos ni tarjetas importadas.
          </p>
        ) : (
          <ul>
            {subDecks.map((child) => (
              <li key={child.id} className="border-b border-border last:border-b-0">
                <Link
                  href={`/decks/${child.slug}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-secondary"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-primary">{child.name}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground-foreground">
                      {child.language
                        ? `${child.language.flag ? `${child.language.flag} ` : ""}${child.language.name}`
                        : "Sin idioma"}
                    </span>
                    {child.isArchived && (
                      <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-700">
                        Archivado
                      </span>
                    )}
                  </span>

                  <span className="flex gap-4 text-xs text-secondary-foreground">
                    <span>Tarjetas: {formatNumber(child.aggregate.total)}</span>
                    <span>Hoy: {formatNumber(child.aggregate.dueToday)}</span>
                    <span>Estudio: {formatDate(child.lastStudiedAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-primary">Tarjetas</h2>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/study/deck/${deck.slug}`}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
            >
              Estudiar este mazo
            </Link>
            <Link
              href={`/decks/${deck.slug}/cards`}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Gestionar tarjetas
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
          <span className="text-sm text-secondary-foreground">
            Total:{" "}
            <strong className="font-semibold text-primary">{formatNumber(deck.stats.total)}</strong>
          </span>
          <span className="text-sm text-secondary-foreground">
            Nuevas:{" "}
            <strong className="font-semibold text-primary">{formatNumber(deck.stats.new)}</strong>
          </span>
          <span className="text-sm text-secondary-foreground">
            Aprendidas:{" "}
            <strong className="font-semibold text-primary">{formatNumber(deck.stats.review)}</strong>
          </span>
          <span className="text-sm text-secondary-foreground">
            Pendientes hoy:{" "}
            <strong className={`font-semibold ${deck.aggregate.dueToday > 0 ? "text-blue-600" : "text-primary"}`}>
              {formatNumber(deck.aggregate.dueToday)}
            </strong>
          </span>

          {deck.stats.total === 0 && (
            <span className="w-full text-sm text-secondary-foreground">
              Este mazo aún no tiene tarjetas propias. Crea la primera o importa un archivo JSON/CSV.
            </span>
          )}
        </div>
      </section>

      {isEditOpen && (
        <DeckEditorModal
          isOpen
          mode="edit"
          title="Editar mazo"
          initialValues={{
            id: deck.id,
            name: deck.name,
            description: deck.description ?? "",
            languageId: deck.language?.id ?? "",
            parentDeckId: deck.parentDeckId ?? "",
          }}
          parentOptions={parentOptions}
          languages={languages}
          onClose={() => setIsEditOpen(false)}
          onSaved={handleSaved}
        />
      )}

      {isDeleteOpen && (
        <DeleteDeckDialog
          isOpen
          deckId={deck.id}
          deckName={deck.name}
          onClose={() => setIsDeleteOpen(false)}
          onDeleted={handleDeleted}
        />
      )}

      {isImportOpen && (
        <ImportCardsDialog
          isOpen
          deckId={deck.id}
          deckName={deck.name}
          onClose={() => setIsImportOpen(false)}
          onImported={handleImported}
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