"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DeckEditorModal from "@/components/decks/DeckEditorModal";
import DeleteDeckDialog from "@/components/decks/DeleteDeckDialog";
import {
  deckOptionsAction,
  listLanguagesAction,
  setDeckArchivedAction,
} from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { formatDate, formatNumber } from "@/lib/format";
import { MAX_DECK_DEPTH } from "@/lib/validation/deck";
import type { DeckNode, DeckOption } from "@/types/deck";
import type { LanguageView } from "@/types/language";

interface DeckListProps {
  decks: DeckNode[];
  hasSearch: boolean;
}

interface Toast {
  type: "success" | "error";
  text: string;
}

interface DeckRowProps {
  deck: DeckNode;
  collapsed: boolean;
  onToggle: (deckId: string) => void;
  onEdit: (deck: DeckNode) => void;
  onDelete: (deck: DeckNode) => void;
  onToggleArchive: (deck: DeckNode) => void;
  busyDeckId: string | null;
}

function DeckRow({
  deck,
  collapsed,
  onToggle,
  onEdit,
  onDelete,
  onToggleArchive,
  busyDeckId,
}: DeckRowProps) {
  const hasChildren = deck.children.length > 0;
  const isBusy = busyDeckId === deck.id;
  const canAddChildren = deck.depth < MAX_DECK_DEPTH;

  return (
    <>
      <li className="border-b border-border last:border-b-0">
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 transition-colors hover:bg-secondary ${
            deck.isMatch ? "" : "opacity-60"
          }`}
          style={{ paddingLeft: `${12 + (deck.depth - 1) * 20}px` }}
        >
          <button
            type="button"
            onClick={() => onToggle(deck.id)}
            disabled={!hasChildren}
            aria-label={hasChildren ? (collapsed ? "Desplegar sub-mazos" : "Plegar sub-mazos") : undefined}
            aria-expanded={hasChildren ? !collapsed : undefined}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-secondary-foreground transition-colors ${
              hasChildren ? "hover:bg-accent hover:text-primary" : "invisible"
            }`}
          >
            <svg
              className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/decks/${deck.slug}`}
                className="truncate text-sm font-semibold text-primary hover:underline"
              >
                {deck.name}
              </Link>

              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground-foreground">
                {deck.language
                  ? `${deck.language.flag ? `${deck.language.flag} ` : ""}${deck.language.name}`
                  : "Sin idioma"}
              </span>

              {deck.isArchived && (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-700">
                  Archivado
                </span>
              )}

              {hasChildren && (
                <span className="text-[11px] text-secondary-foreground">
                  {deck.children.length} sub-mazo{deck.children.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {deck.description && (
              <p className="mt-0.5 truncate text-xs text-secondary-foreground">{deck.description}</p>
            )}

            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-secondary-foreground">
              <span>
                Tarjetas:{" "}
                <strong className="font-semibold text-primary">{formatNumber(deck.aggregate.total)}</strong>
              </span>
              <span>
                Nuevas: <strong className="font-semibold text-primary">{formatNumber(deck.stats.new)}</strong>
              </span>
              <span>
                Hoy:{" "}
                <strong
                  className={`font-semibold ${deck.aggregate.dueToday > 0 ? "text-blue-600" : "text-primary"}`}
                >
                  {formatNumber(deck.aggregate.dueToday)}
                </strong>
              </span>
              <span>Último estudio: {formatDate(deck.lastStudiedAt)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canAddChildren && (
              <Link
                href={`/decks/new?parent=${deck.id}`}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary"
              >
                + Sub-mazo
              </Link>
            )}

            <button
              type="button"
              onClick={() => onEdit(deck)}
              disabled={isBusy}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
            >
              Editar
            </button>

            <button
              type="button"
              onClick={() => onToggleArchive(deck)}
              disabled={isBusy}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
            >
              {deck.isArchived ? "Desarchivar" : "Archivar"}
            </button>

            <button
              type="button"
              onClick={() => onDelete(deck)}
              disabled={isBusy}
              className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Eliminar
            </button>
          </div>
        </div>
      </li>

      {hasChildren &&
        !collapsed &&
        deck.children.map((child) => (
          <DeckRow
            key={child.id}
            deck={child}
            collapsed={collapsed}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleArchive={onToggleArchive}
            busyDeckId={busyDeckId}
          />
        ))}
    </>
  );
}

export default function DeckList({ decks, hasSearch }: DeckListProps) {
  const router = useRouter();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [editingDeck, setEditingDeck] = useState<DeckNode | null>(null);
  const [editingOptions, setEditingOptions] = useState<DeckOption[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeckNode | null>(null);
  const [busyDeckId, setBusyDeckId] = useState<string | null>(null);
  const [languages, setLanguages] = useState<LanguageView[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);

  // El catálogo de idiomas del usuario se carga una vez para poblar el editor de
  // mazo; los selectores de idioma no se guardan en la URL porque cambian con la BD.
  useEffect(() => {
    let isActive = true;

    async function loadLanguages() {
      const result = await listLanguagesAction();

      if (isSuccess(result) && isActive) {
        setLanguages(result[0].languages);
      }
    }

    loadLanguages();

    return () => {
      isActive = false;
    };
  }, []);

  function handleToggle(deckId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);

      if (next.has(deckId)) {
        next.delete(deckId);
      } else {
        next.add(deckId);
      }

      return next;
    });
  }

  async function handleEdit(deck: DeckNode) {
    setEditingDeck(deck);
    setEditingOptions([]);

    const result = await deckOptionsAction({ excludeDeckId: deck.id });

    if (isSuccess(result)) {
      setEditingOptions(result[0].options);
    }
  }

  async function handleToggleArchive(deck: DeckNode) {
    setBusyDeckId(deck.id);

    const result = await setDeckArchivedAction({ id: deck.id, isArchived: !deck.isArchived });

    setBusyDeckId(null);

    if (isError(result)) {
      setToast({
        type: "error",
        text: getErrorMessage(result[1].message, "No se pudo actualizar el mazo"),
      });
      return;
    }

    setToast({
      type: "success",
      text: deck.isArchived ? "Mazo desarchivado" : "Mazo archivado",
    });
    router.refresh();
  }

  function handleSaved(deckName: string) {
    setEditingDeck(null);
    setToast({ type: "success", text: `Mazo "${deckName}" guardado` });
    router.refresh();
  }

  function handleDeleted(deckName: string) {
    setDeleteTarget(null);
    setToast({ type: "success", text: `Mazo "${deckName}" eliminado` });
    router.refresh();
  }

  if (decks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
        <p className="text-sm text-secondary-foreground">
          {hasSearch
            ? "Ningún mazo coincide con los filtros aplicados."
            : "Todavía no tienes mazos. Crea el primero para empezar a estudiar."}
        </p>
        {!hasSearch && (
          <Link
            href="/decks/new"
            className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Crear mi primer mazo
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <ul>
        {decks.map((deck) => (
          <DeckRow
            key={deck.id}
            deck={deck}
            collapsed={hasSearch ? false : collapsedIds.has(deck.id)}
            onToggle={handleToggle}
            onEdit={handleEdit}
            onDelete={setDeleteTarget}
            onToggleArchive={handleToggleArchive}
            busyDeckId={busyDeckId}
          />
        ))}
      </ul>

      {editingDeck && (
        <DeckEditorModal
          isOpen
          mode="edit"
          title="Editar mazo"
          initialValues={{
            id: editingDeck.id,
            name: editingDeck.name,
            description: editingDeck.description ?? "",
            languageId: editingDeck.language?.id ?? "",
            parentDeckId: editingDeck.parentDeckId ?? "",
          }}
          parentOptions={editingOptions}
          languages={languages}
          onClose={() => setEditingDeck(null)}
          onSaved={(deck) => handleSaved(deck.name)}
        />
      )}

      {deleteTarget && (
        <DeleteDeckDialog
          isOpen
          deckId={deleteTarget.id}
          deckName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => handleDeleted(deleteTarget.name)}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-red-500 bg-red-50 text-red-700"
          }`}
          role="status"
        >
          <div className="flex items-center gap-3">
            {toast.text}
            <button type="button" onClick={() => setToast(null)} aria-label="Cerrar aviso" className="font-bold">
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}