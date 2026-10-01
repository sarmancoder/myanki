"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { deleteCardsAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { formatNumber } from "@/lib/format";
import { toPlainText } from "@/lib/cards/cloze";
import type { CardListItem } from "@/types/card";

interface DeleteCardsDialogProps {
  isOpen: boolean;
  /** Una tarjeta (eliminación individual) o varias (eliminación en lote). */
  cards: CardListItem[];
  onClose: () => void;
  onDeleted: () => void;
}



export default function DeleteCardsDialog({
  isOpen,
  cards,
  onClose,
  onDeleted,
}: DeleteCardsDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBatch = cards.length > 1;

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    const result = await deleteCardsAction({ ids: cards.map((card) => card.id) });

    if (isError(result)) {
      setError(getErrorMessage(result[1].message, "No se pudieron eliminar las tarjetas"));
      setIsDeleting(false);
      return;
    }

    if (isSuccess(result)) {
      onDeleted();
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isBatch ? "Eliminar tarjetas" : "Eliminar tarjeta"}
      size="sm"
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || cards.length === 0}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? "Eliminando..." : "Eliminar definitivamente"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-primary">
          {isBatch ? (
            <>
              ¿Seguro que quieres eliminar{" "}
              <strong className="font-semibold">{formatNumber(cards.length)} tarjetas</strong>? Esta acción no se
              puede deshacer.
            </>
          ) : (
            <>
              ¿Seguro que quieres eliminar esta tarjeta? Esta acción no se puede deshacer.
            </>
          )}
        </p>

        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>
            Se eliminará también su historial de estudio y su programación SRS
            {isBatch ? " de cada tarjeta" : ""}.
          </p>
        </div>

        {isBatch && (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-secondary-foreground">
            {cards.map((card) => (
              <li key={card.id} className="truncate">
                · {toPlainText(card.front).slice(0, 70) || "(anverso vacío)"}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}