"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { deckDeleteImpactAction, deleteDeckAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { formatNumber } from "@/lib/format";
import type { DeckDeleteImpact } from "@/types/deck";

interface DeleteDeckDialogProps {
  deckId: string;
  deckName: string;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: (impact: DeckDeleteImpact) => void;
}

export default function DeleteDeckDialog({
  deckId,
  deckName,
  isOpen,
  onClose,
  onDeleted,
}: DeleteDeckDialogProps) {
  const [impact, setImpact] = useState<DeckDeleteImpact | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLoadingImpact = impact === null && error === null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let active = true;

    async function loadImpact() {
      const result = await deckDeleteImpactAction({ id: deckId });

      if (!active) {
        return;
      }

      if (isSuccess(result)) {
        setImpact(result[0]);
      } else if (isError(result)) {
        setError(result[1].message);
      }
    }

    loadImpact();

    return () => {
      active = false;
    };
  }, [isOpen, deckId]);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);

    const result = await deleteDeckAction({ id: deckId });

    if (isError(result)) {
      setError(getErrorMessage(result[1].message, "No se pudo eliminar el mazo"));
      setIsDeleting(false);
      return;
    }

    if (isSuccess(result)) {
      onDeleted(result[0]);
      setIsDeleting(false);
    }
  }

  const subdeckCount = impact ? Math.max(impact.deckCount - 1, 0) : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Eliminar mazo"
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
            disabled={isDeleting || isLoadingImpact || impact === null}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? "Eliminando..." : "Eliminar definitivamente"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-primary">
          ¿Seguro que quieres eliminar el mazo{" "}
          <span className="font-semibold">{deckName}</span>? Esta acción no se puede deshacer.
        </p>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {isLoadingImpact && "Calculando el contenido a eliminar..."}

          {impact && (
            <ul className="space-y-1">
              <li>
                <strong>{formatNumber(impact.deckCount)}</strong> mazo
                {impact.deckCount === 1 ? "" : "s"} (incluido este)
              </li>
              <li>
                <strong>{formatNumber(subdeckCount)}</strong> sub-mazo
                {subdeckCount === 1 ? "" : "s"} anidado{subdeckCount === 1 ? "" : "s"}
              </li>
              <li>
                <strong>{formatNumber(impact.cardCount)}</strong> tarjeta
                {impact.cardCount === 1 ? "" : "s"} y su historial de estudio
              </li>
            </ul>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}