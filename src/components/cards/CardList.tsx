"use client";

import { useState } from "react";
import Link from "next/link";
import { getCardColorOption, getCardTypeLabel } from "@/constants/cards";
import { setCardsSuspendedAction } from "@/server/actions";
import { getErrorMessage, isError } from "@/lib/orpc";
import { formatDate } from "@/lib/format";
import { sortExtraFields } from "@/lib/cards/extra-fields";
import { toPlainText } from "@/lib/cards/cloze";
import Markdown from "@/components/ui/Markdown";
import CardPreview from "@/components/cards/CardPreview";
import CardStatusBadge from "@/components/cards/CardStatusBadge";
import CardEditorModal from "@/components/cards/CardEditorModal";
import DeleteCardsDialog from "@/components/cards/DeleteCardsDialog";
import MoveCardsModal from "@/components/cards/MoveCardsModal";
import type { CardListItem } from "@/types/card";
import type { LanguageRef } from "@/types/language";

interface CardListProps {
  cards: CardListItem[];
  deckId: string;
  deckSlug: string;
  deckName: string;
  /** Idioma del mazo, que el formulario de edición muestra en la etiqueta del anverso. */
  deckLanguage: LanguageRef | null;
  /** Se invoca tras cualquier mutación para que el contenedor refresque los datos. */
  onChanged: (message: string) => void;
}

function formatInterval(days: number): string {
  if (days <= 0) {
    return "—";
  }

  if (days === 1) {
    return "1 día";
  }

  if (days < 30) {
    return `${days} días`;
  }

  if (days < 365) {
    return `${Math.round(days / 30)} meses`;
  }

  const years = days / 365;

  return `${Number.isInteger(years) ? years : years.toFixed(1)} años`;
}

interface CardRowProps {
  card: CardListItem;
  isSelected: boolean;
  isBusy: boolean;
  onToggleSelect: (cardId: string) => void;
  onEdit: (card: CardListItem) => void;
  onDelete: (card: CardListItem) => void;
  onToggleSuspend: (card: CardListItem) => void;
}

function CardRow({
  card,
  isSelected,
  isBusy,
  onToggleSelect,
  onEdit,
  onDelete,
  onToggleSuspend,
}: CardRowProps) {
  const color = getCardColorOption(card.colorTag);
  const extraFields = sortExtraFields(card.extraFields);
  const isCloze = card.cardType === "cloze";

  return (
    <li className={`border-b border-border last:border-b-0 ${isSelected ? "bg-secondary/50" : ""}`}>
      <div className="flex items-start gap-3 px-3 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(card.id)}
          aria-label={`Seleccionar tarjeta: ${toPlainText(card.front).slice(0, 40)}`}
          className="mt-1 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary"
        />

        <span
          aria-hidden="true"
          title={color ? `Color: ${color.label}` : "Sin color"}
          className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${color ? color.dotClassName : "ring-1 ring-border"}`}
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground">
                Anverso
              </p>
              <CardPreview front={card.front} isCloze={isCloze} clamp={3} />
            </div>

            <div className="min-w-0">
              <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground">
                Reverso
              </p>
              {card.back.trim().length > 0 ? (
                <Markdown clamp={3}>{card.back}</Markdown>
              ) : (
                <span className="text-sm text-secondary-foreground">—</span>
              )}
            </div>
          </div>

          {(card.imageUrl || card.audioUrl || extraFields.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-secondary-foreground">
              {card.imageUrl && (
                <span className="rounded bg-secondary px-1.5 py-0.5 font-medium">Con imagen</span>
              )}
              {card.audioUrl && (
                <span className="rounded bg-secondary px-1.5 py-0.5 font-medium">Con audio</span>
              )}
              {extraFields.map(([key, value]) => (
                <span key={key} className="rounded bg-secondary px-1.5 py-0.5">
                  <span className="font-medium text-primary">{key}:</span> {value}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary-foreground">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground-foreground">
              {getCardTypeLabel(card.cardType)}
            </span>
            <CardStatusBadge status={card.isSuspended ? "suspended" : card.scheduling.status} />
            <span title={`${card.scheduling.intervalDays} días`}>
              Intervalo: {formatInterval(card.scheduling.intervalDays)}
            </span>
            <span>Creada: {formatDate(card.createdAt)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(card)}
            disabled={isBusy}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Editar
          </button>

          <button
            type="button"
            onClick={() => onToggleSuspend(card)}
            disabled={isBusy}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
          >
            {card.isSuspended ? "Reactivar" : "Suspender"}
          </button>

          <button
            type="button"
            onClick={() => onDelete(card)}
            disabled={isBusy}
            className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Eliminar
          </button>
        </div>
      </div>
    </li>
  );
}

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
  onSuspendAll: (isSuspended: boolean) => void;
  onMove: () => void;
  onDelete: () => void;
  isBusy: boolean;
}

function BulkActionsBar({
  selectedIds,
  onClear,
  onSuspendAll,
  onMove,
  onDelete,
  isBusy,
}: BulkActionsBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary bg-secondary/60 px-3 py-2">
      <span className="text-xs font-medium text-primary">
        {selectedIds.length} tarjeta{selectedIds.length === 1 ? "" : "s"} seleccionada
        {selectedIds.length === 1 ? "" : "s"}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSuspendAll(true)}
          disabled={isBusy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Suspender
        </button>
        <button
          type="button"
          onClick={() => onSuspendAll(false)}
          disabled={isBusy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Reactivar
        </button>
        <button
          type="button"
          onClick={onMove}
          disabled={isBusy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Mover
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isBusy}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Eliminar
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={isBusy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Cancelar selección
        </button>
      </div>
    </div>
  );
}

export default function CardList({
  cards,
  deckId,
  deckSlug,
  deckName,
  deckLanguage,
  onChanged,
}: CardListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editingCard, setEditingCard] = useState<CardListItem | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<CardListItem[] | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSelect(cardId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }

      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleToggleSuspend(card: CardListItem) {
    setError(null);
    setBusy(true);

    const result = await setCardsSuspendedAction({ ids: [card.id], isSuspended: !card.isSuspended });

    setBusy(false);

    if (isError(result)) {
      setError(getErrorMessage(result[1].message, "No se pudo actualizar la tarjeta"));
      return;
    }

    onChanged(card.isSuspended ? "Tarjeta reactivada" : "Tarjeta suspendida");
  }

  async function handleBulkSuspend(isSuspended: boolean) {
    const ids = [...selectedIds];

    if (ids.length === 0) {
      return;
    }

    setError(null);
    setBusy(true);

    const result = await setCardsSuspendedAction({ ids, isSuspended });

    setBusy(false);

    if (isError(result)) {
      setError(getErrorMessage(result[1].message, "No se pudieron actualizar las tarjetas"));
      return;
    }

    clearSelection();
    onChanged(isSuspended ? "Tarjetas suspendidas" : "Tarjetas reactivadas");
  }

  function handleDeleted() {
    const count = deleteTargets?.length ?? 0;

    setDeleteTargets(null);
    setSelectedIds(new Set());
    onChanged(count === 1 ? "Tarjeta eliminada" : `${count} tarjetas eliminadas`);
  }

  function handleMoved() {
    const count = isMoving ? 1 : selectedIds.size;

    setIsMoving(false);
    setSelectedIds(new Set());
    onChanged(count === 1 ? "Tarjeta movida" : `${count} tarjetas movidas`);
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
        <p className="text-sm text-secondary-foreground">
          Ninguna tarjeta coincide con los filtros aplicados.
        </p>
        <Link
          href={`/decks/${deckSlug}/cards/new`}
          className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Crear una tarjeta
        </Link>
      </div>
    );
  }

  const pageIds = cards.map((card) => card.id);
  const allSelected = pageIds.every((id) => selectedIds.has(id));
  const selectedCards = cards.filter((card) => selectedIds.has(card.id));

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedIds={[...selectedIds]}
          onClear={clearSelection}
          onSuspendAll={handleBulkSuspend}
          onMove={() => setIsMoving(true)}
          onDelete={() => setDeleteTargets(selectedCards)}
          isBusy={busy}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
        <label className="flex items-center gap-2 text-xs font-medium text-secondary-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelectedIds(allSelected ? new Set() : new Set(pageIds))}
            aria-label="Seleccionar todas las tarjetas de esta página"
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Seleccionar página
        </label>

        <span className="text-xs text-secondary-foreground">
          {cards.length} tarjeta{cards.length === 1 ? "" : "s"} en esta página
        </span>
      </div>

      <ul className="overflow-hidden rounded-lg border border-border bg-background">
        {cards.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            isSelected={selectedIds.has(card.id)}
            isBusy={busy}
            onToggleSelect={toggleSelect}
            onEdit={setEditingCard}
            onDelete={(target) => setDeleteTargets([target])}
            onToggleSuspend={handleToggleSuspend}
          />
        ))}
      </ul>

      {editingCard && (
        <CardEditorModal
          isOpen
          card={editingCard}
          deckLanguage={deckLanguage}
          onClose={() => setEditingCard(null)}
          onSaved={() => {
            setEditingCard(null);
            onChanged("Tarjeta actualizada");
          }}
        />
      )}

      {deleteTargets && (
        <DeleteCardsDialog
          isOpen
          cards={deleteTargets}
          onClose={() => setDeleteTargets(null)}
          onDeleted={handleDeleted}
        />
      )}

      {isMoving && (
        <MoveCardsModal
          isOpen
          cardIds={[...selectedIds]}
          currentDeckId={deckId}
          currentDeckName={deckName}
          onClose={() => setIsMoving(false)}
          onMoved={handleMoved}
        />
      )}
    </div>
  );
}