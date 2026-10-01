"use client";

import Modal from "@/components/ui/Modal";
import BatchCardsForm from "@/components/forms/BatchCardsForm";
import type { BatchCreateResult } from "@/types/card";

interface BatchCardsDialogProps {
  isOpen: boolean;
  deckId: string;
  deckName: string;
  onClose: () => void;
  onCreated: (result: BatchCreateResult) => void;
}

export default function BatchCardsDialog({
  isOpen,
  deckId,
  deckName,
  onClose,
  onCreated,
}: BatchCardsDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Crear tarjetas en lote"
      description={`Se añadirán al mazo "${deckName}".`}
      size="lg"
    >
      <BatchCardsForm deckId={deckId} onSuccess={onCreated} onCancel={onClose} />
    </Modal>
  );
}