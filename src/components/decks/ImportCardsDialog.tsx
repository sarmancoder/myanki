"use client";

import Modal from "@/components/ui/Modal";
import ImportCardsForm from "@/components/forms/ImportCardsForm";
import type { ImportResult } from "@/types/deck";

interface ImportCardsDialogProps {
  isOpen: boolean;
  deckId?: string;
  deckName?: string;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
}

export default function ImportCardsDialog({
  isOpen,
  deckId,
  deckName,
  onClose,
  onImported,
}: ImportCardsDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={deckId ? "Importar tarjetas" : "Importar mazo"}
      description={
        deckId
          ? `Las tarjetas se añadirán al mazo "${deckName ?? ""}".`
          : "Se creará un mazo nuevo con las tarjetas del archivo."
      }
    >
      <ImportCardsForm deckId={deckId} onSuccess={onImported} onCancel={onClose} />
    </Modal>
  );
}