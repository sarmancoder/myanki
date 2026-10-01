"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { cardMoveTargetsAction, moveCardsAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import type { DeckOption } from "@/types/deck";

interface MoveCardsModalProps {
  isOpen: boolean;
  cardIds: string[];
  currentDeckId: string;
  currentDeckName: string;
  onClose: () => void;
  onMoved: () => void;
}

/**
 * Mueve una o varias tarjetas a otro mazo (RF-011). Los destinos se cargan bajo
 * demanda desde el servidor: la lista de mazos puede ser larga y solo hace falta
 * cuando el usuario abre el diálogo.
 */
export default function MoveCardsModal({
  isOpen,
  cardIds,
  currentDeckId,
  currentDeckName,
  onClose,
  onMoved,
}: MoveCardsModalProps) {
  const [options, setOptions] = useState<DeckOption[]>([]);
  const [targetDeckId, setTargetDeckId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let active = true;

    async function loadTargets() {
      setIsLoading(true);

      // El router de tarjetas necesita una tarjeta de referencia; se usa la primera
      // de la selección porque todas comparten mazo de origen.
      const result = await cardMoveTargetsAction({ id: cardIds[0] ?? "" });

      if (!active) {
        return;
      }

      setIsLoading(false);

      if (isSuccess(result)) {
        setOptions(result[0].options);
        return;
      }

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudieron cargar los mazos de destino"));
      }
    }

    loadTargets();

    return () => {
      active = false;
    };
  }, [isOpen, cardIds]);

  async function handleMove() {
    if (!targetDeckId) {
      setError("Selecciona un mazo de destino");
      return;
    }

    setIsMoving(true);
    setError(null);

    const result = await moveCardsAction({ ids: cardIds, deckId: targetDeckId });

    if (isError(result)) {
      setError(getErrorMessage(result[1].message, "No se pudieron mover las tarjetas"));
      setIsMoving(false);
      return;
    }

    if (isSuccess(result)) {
      onMoved();
    }
  }

  const count = cardIds.length;
  const targetDeck = options.find((option) => option.id === targetDeckId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={count === 1 ? "Mover tarjeta" : `Mover ${count} tarjetas`}
      size="sm"
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isMoving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleMove}
            disabled={isMoving || isLoading || !targetDeckId}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isMoving ? "Moviendo..." : "Mover aquí"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-primary">
          {count === 1 ? "La tarjeta" : <><strong className="font-semibold">{count} tarjetas</strong></>} se moverán
          desde{" "}
          <strong className="font-semibold">{currentDeckName}</strong>. Su historial de estudio y su programación
          SRS se conservan.
        </p>

        {isLoading ? (
          <p className="text-sm text-secondary-foreground">Cargando mazos...</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-secondary-foreground">
            No tienes otros mazos. Crea uno nuevo para poder mover la tarjeta.
          </p>
        ) : (
          <div>
            <label htmlFor="move-target-deck" className="block text-sm font-medium text-primary">
              Mazo de destino <span className="text-red-500">*</span>
            </label>
            <select
              id="move-target-deck"
              value={targetDeckId}
              onChange={(event) => setTargetDeckId(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Selecciona un mazo —</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {`${"— ".repeat(Math.max(option.depth - 1, 0))}${option.name}`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-secondary-foreground">
              {currentDeckId === targetDeckId
                ? "Ya está en este mazo."
                : targetDeck
                  ? `Se moverá a "${targetDeck.name}".`
                  : "Las tarjetas saldrán del listado actual."}
            </p>
          </div>
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