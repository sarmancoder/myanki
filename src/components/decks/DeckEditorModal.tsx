"use client";

import Modal from "@/components/ui/Modal";
import DeckForm, { type DeckFormInitialValues } from "@/components/forms/DeckForm";
import type { DeckOption, DeckSummary } from "@/types/deck";
import type { LanguageView } from "@/types/language";

interface DeckEditorModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  title: string;
  description?: string;
  initialValues?: DeckFormInitialValues;
  parentOptions: DeckOption[];
  /** Catálogo de idiomas del usuario, para el selector de idioma del mazo. */
  languages: LanguageView[];
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
  languages,
  onClose,
  onSaved,
}: DeckEditorModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} description={description}>
      <DeckForm
        mode={mode}
        initialValues={initialValues}
        parentOptions={parentOptions}
        languages={languages}
        onSuccess={onSaved}
        onCancel={onClose}
      />
    </Modal>
  );
}