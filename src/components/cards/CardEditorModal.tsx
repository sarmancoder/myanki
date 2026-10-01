"use client";

import Modal from "@/components/ui/Modal";
import CardForm from "@/components/forms/CardForm";
import type { CardListItem } from "@/types/card";

interface CardEditorModalProps {
  isOpen: boolean;
  card: CardListItem;
  onClose: () => void;
  onSaved: (card: CardListItem) => void;
}

export default function CardEditorModal({ isOpen, card, onClose, onSaved }: CardEditorModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar tarjeta" size="lg">
      <CardForm
        mode="edit"
        deckId={card.deck.id}
        initialValues={{
          id: card.id,
          cardType: card.cardType,
          front: card.front,
          back: card.back,
          extraFields: card.extraFields,
          imageUrl: card.imageUrl,
          audioUrl: card.audioUrl,
          colorTag: card.colorTag,
          isSuspended: card.isSuspended,
        }}
        onSuccess={(saved) => onSaved(saved)}
        onCancel={onClose}
      />
    </Modal>
  );
}