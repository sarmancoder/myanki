"use client";

import { useState } from "react";
import { z } from "zod";
import { LANGUAGES } from "@/constants/languages";
import { createDeckAction, updateDeckAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import {
  deckDescriptionSchema,
  deckLanguageSchema,
  deckNameSchema,
} from "@/lib/validation/deck";
import type { DeckOption, DeckSummary } from "@/types/deck";

const deckFormSchema = z.object({
  name: deckNameSchema,
  description: deckDescriptionSchema.optional(),
  languageCode: deckLanguageSchema,
  parentDeckId: z.union([z.literal(""), z.string().uuid("Selecciona un mazo padre válido")]),
});

export interface DeckFormValues {
  name: string;
  description: string;
  languageCode: string;
  parentDeckId: string;
}

export interface DeckFormInitialValues extends Partial<DeckFormValues> {
  id?: string;
}

interface DeckFormProps {
  mode: "create" | "edit";
  initialValues?: DeckFormInitialValues;
  parentOptions: DeckOption[];
  submitLabel?: string;
  onSuccess: (deck: DeckSummary) => void;
  onCancel?: () => void;
}

const INPUT_CLASS =
  "block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";
const ERROR_INPUT_CLASS = "border-red-500 focus:border-red-500 focus:ring-red-500";
const LABEL_CLASS = "block text-sm font-medium text-primary";

interface FieldErrorsProps {
  errors: string[] | undefined;
  id: string;
}

function FieldErrors({ errors, id }: FieldErrorsProps) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <ul id={id} className="mt-1 space-y-0.5" role="alert">
      {errors.map((error) => (
        <li key={error} className="text-xs font-medium text-red-600">
          {error}
        </li>
      ))}
    </ul>
  );
}

export default function DeckForm({
  mode,
  initialValues,
  parentOptions,
  submitLabel,
  onSuccess,
  onCancel,
}: DeckFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const values = {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      languageCode: String(formData.get("languageCode") ?? ""),
      parentDeckId: String(formData.get("parentDeckId") ?? ""),
    };

    const parsed = deckFormSchema.safeParse(values);

    if (!parsed.success) {
      const errors: Record<string, string[]> = {};

      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        errors[field] = [...(errors[field] ?? []), issue.message];
      }

      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsLoading(true);

    const input = {
      name: parsed.data.name,
      description: parsed.data.description,
      languageCode: parsed.data.languageCode,
      parentDeckId: parsed.data.parentDeckId === "" ? null : parsed.data.parentDeckId,
    };

    try {
      const result =
        mode === "create"
          ? await createDeckAction(input)
          : await updateDeckAction({ id: initialValues?.id ?? "", ...input });

      if (isError(result)) {
        setFormError(getErrorMessage(result[1].message, "No se pudo guardar el mazo"));
        return;
      }

      if (isSuccess(result)) {
        onSuccess(result[0].deck);
      }
    } catch {
      setFormError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  }

  const hasError = (field: string) => (fieldErrors[field]?.length ?? 0) > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {formError && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {formError}
        </div>
      )}

      <div>
        <label htmlFor="deck-name" className={LABEL_CLASS}>
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          id="deck-name"
          name="name"
          type="text"
          maxLength={100}
          defaultValue={initialValues?.name ?? ""}
          aria-invalid={hasError("name")}
          aria-describedby={hasError("name") ? "deck-name-errors" : undefined}
          className={`mt-1 ${INPUT_CLASS} ${hasError("name") ? ERROR_INPUT_CLASS : ""}`}
        />
        <FieldErrors id="deck-name-errors" errors={fieldErrors.name} />
      </div>

      <div>
        <label htmlFor="deck-description" className={LABEL_CLASS}>
          Descripción
        </label>
        <textarea
          id="deck-description"
          name="description"
          rows={3}
          maxLength={500}
          defaultValue={initialValues?.description ?? ""}
          aria-invalid={hasError("description")}
          aria-describedby={hasError("description") ? "deck-description-errors" : undefined}
          className={`mt-1 ${INPUT_CLASS} ${hasError("description") ? ERROR_INPUT_CLASS : ""}`}
        />
        <FieldErrors id="deck-description-errors" errors={fieldErrors.description} />
      </div>

      <div>
        <label htmlFor="deck-language" className={LABEL_CLASS}>
          Idioma <span className="text-red-500">*</span>
        </label>
        <select
          id="deck-language"
          name="languageCode"
          defaultValue={initialValues?.languageCode ?? "es"}
          aria-invalid={hasError("languageCode")}
          aria-describedby={hasError("languageCode") ? "deck-language-errors" : undefined}
          className={`mt-1 ${INPUT_CLASS} ${hasError("languageCode") ? ERROR_INPUT_CLASS : ""}`}
        >
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.flag} {language.label}
            </option>
          ))}
        </select>
        <FieldErrors id="deck-language-errors" errors={fieldErrors.languageCode} />
      </div>

      <div>
        <label htmlFor="deck-parent" className={LABEL_CLASS}>
          Mazo padre
        </label>
        <select
          id="deck-parent"
          name="parentDeckId"
          defaultValue={initialValues?.parentDeckId ?? ""}
          aria-invalid={hasError("parentDeckId")}
          aria-describedby={hasError("parentDeckId") ? "deck-parent-errors" : undefined}
          className={`mt-1 ${INPUT_CLASS} ${hasError("parentDeckId") ? ERROR_INPUT_CLASS : ""}`}
        >
          <option value="">— Sin mazo padre (nivel raíz) —</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {`${"— ".repeat(Math.max(option.depth - 1, 0))}${option.name}`}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-secondary">
          La jerarquía admite un máximo de 3 niveles.
        </p>
        <FieldErrors id="deck-parent-errors" errors={fieldErrors.parentDeckId} />
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? "Guardando..." : (submitLabel ?? (mode === "create" ? "Crear mazo" : "Guardar cambios"))}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}