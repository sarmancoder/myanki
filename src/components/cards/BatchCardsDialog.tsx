"use client";

import Modal from "@/components/ui/Modal";
import BatchCardsForm from "@/components/forms/BatchCardsForm";
import type { BatchCreateResult } from "@/types/card";
import type { LanguageRef } from "@/types/language";

interface BatchCardsDialogProps {
  isOpen: boolean;
  deckId: string;
  deckName: string;
  /** Idioma del mazo, para que la ayuda de las columnas lo mencione. */
  deckLanguage: LanguageRef | null;
  onClose: () => void;
  onCreated: (result: BatchCreateResult) => void;
}

export default function BatchCardsDialog({
  isOpen,
  deckId,
  deckName,
  deckLanguage,
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
      <BatchCardsForm
        deckId={deckId}
        deckLanguage={deckLanguage}
        onSuccess={onCreated}
        onCancel={onClose}
      />
    </Modal>
  );
}