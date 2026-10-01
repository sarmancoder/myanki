"use client";

import Modal from "@/components/ui/Modal";
import DeckForm, { type DeckFormInitialValues } from "@/components/forms/DeckForm";
import type { DeckOption, DeckSummary } from "@/types/deck";

interface DeckEditorModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  title: string;
  description?: string;
  initialValues?: DeckFormInitialValues;
  parentOptions: DeckOption[];
  onClose: () => void;
  onSaved: (deck: DeckSummary) => void;
}

export default function DeckEditorModal({
  isOpen,
  mode,
  title,
  description,
  initialValues,
  parentOptions,
  onClose,
  onSaved,
}: DeckEditorModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={description}>
      <DeckForm
        mode={mode}
        initialValues={initialValues}
        parentOptions={parentOptions}
        onSuccess={onSaved}
        onCancel={onClose}
      />
    </Modal>
  );
}