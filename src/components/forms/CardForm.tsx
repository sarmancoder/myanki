"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { CARD_TYPE_OPTIONS, type CardColorTag, type CardType } from "@/constants/cards";
import { createCardAction, updateCardAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { hasCloze, listClozeIndexes } from "@/lib/cards/cloze";
import {
  cardBackSchema,
  cardExtraFieldsSchema,
  cardSideSchema,
  cardTypeSchema,
} from "@/lib/validation/card";
import CardExtraFieldsEditor, {
  toExtraFieldDrafts,
  type ExtraFieldDraft,
} from "@/components/cards/CardExtraFieldsEditor";
import CardMediaFields from "@/components/cards/CardMediaFields";
import CardColorTagSelect from "@/components/cards/CardColorTagSelect";
import CardPreview from "@/components/cards/CardPreview";
import { formatLanguageName } from "@/lib/format";
import type { CardListItem } from "@/types/card";
import type { LanguageRef } from "@/types/language";

const cardFormSchema = z.object({
  cardType: cardTypeSchema,
  front: cardSideSchema,
  back: cardBackSchema,
  extraFields: cardExtraFieldsSchema,
});

export interface CardFormInitialValues {
  id?: string;
  cardType: CardType;
  front: string;
  back: string;
  extraFields: Record<string, string>;
  imageUrl: string | null;
  audioUrl: string | null;
  colorTag: CardColorTag | null;
  isSuspended: boolean;
}

interface CardFormProps {
  mode: "create" | "edit";
  deckId: string;
  /** Idioma del mazo; se muestra en la etiqueta del anverso para no mezclar idiomas. */
  deckLanguage?: LanguageRef | null;
  initialValues?: CardFormInitialValues;
  /** `true` en el formulario de alta: muestra el botón "guardar y crear otra" (Ctrl+Enter). */
  enableQuickCreate?: boolean;
  submitLabel?: string;
  onSuccess: (card: CardListItem, context: { keptOpen: boolean }) => void;
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

/** Muestra todos los errores de un campo a la vez, no solo el primero. */
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

export default function CardForm({
  mode,
  deckId,
  deckLanguage,
  initialValues,
  enableQuickCreate = false,
  submitLabel,
  onSuccess,
  onCancel,
}: CardFormProps) {
  const [cardType, setCardType] = useState<CardType>(initialValues?.cardType ?? "basic");
  const [front, setFront] = useState(initialValues?.front ?? "");
  const [extraFields, setExtraFields] = useState<ExtraFieldDraft[]>(
    toExtraFieldDrafts(initialValues?.extraFields ?? {})
  );
  const [media, setMedia] = useState({ imageUrl: initialValues?.imageUrl ?? null, audioUrl: initialValues?.audioUrl ?? null });
  const [colorTag, setColorTag] = useState<CardColorTag | null>(initialValues?.colorTag ?? null);
  const [isSuspended, setIsSuspended] = useState(initialValues?.isSuspended ?? false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  // `true` cuando el último guardado vino de Ctrl+Enter: el formulario se limpia
  // y el foco vuelve al anverso para escribir la siguiente tarjeta sin usar el ratón.
  const keepOpenRef = useRef(false);

  const hasError = (field: string) => (fieldErrors[field]?.length ?? 0) > 0;
  const clozeIndexes = cardType === "cloze" ? listClozeIndexes(front) : [];
  const missingCloze = cardType === "cloze" && !hasCloze(front);
  // El anverso va siempre en el idioma del mazo, así que se dice en la etiqueta:
  // "Anverso (🇫🇷 Francés)". Si el mazo no tiene idioma, la etiqueta no lo menciona.
  const languageLabel = deckLanguage ? formatLanguageName(deckLanguage) : null;
  const frontLabel =
    cardType === "cloze"
      ? `Anverso (${languageLabel ? `${languageLabel}, ` : ""}texto con huecos)`
      : `Anverso${languageLabel ? ` (${languageLabel})` : ""}`;

  function resetForNextCard() {
    formRef.current?.reset();
    setCardType("basic");
    setFront("");
    setExtraFields([]);
    setMedia({ imageUrl: null, audioUrl: null });
    setColorTag(null);
    setIsSuspended(false);
    setFieldErrors({});
    setFormError(null);
    frontRef.current?.focus();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const keepOpen = keepOpenRef.current;
    keepOpenRef.current = false;

    const formData = new FormData(event.currentTarget);

    const values = {
      cardType,
      front,
      back: String(formData.get("back") ?? ""),
      extraFields: extraFields.map((field) => ({ key: field.key.trim(), value: field.value.trim() })),
    };

    const parsed = cardFormSchema.safeParse(values);

    if (!parsed.success) {
      const errors: Record<string, string[]> = {};

      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        errors[field] = [...(errors[field] ?? []), issue.message];
      }

      setFieldErrors(errors);
      setFormError("Revisa los campos marcados antes de guardar.");
      return;
    }

    if (parsed.data.cardType === "cloze" && !hasCloze(parsed.data.front)) {
      setFieldErrors({
        front: ["Una tarjeta cloze necesita al menos un borrado con el formato {{c1::texto}}"],
      });
      return;
    }

    setFieldErrors({});
    setIsLoading(true);

    const input = {
      deckId,
      cardType: parsed.data.cardType,
      front: parsed.data.front,
      back: parsed.data.back,
      extraFields: parsed.data.extraFields,
      imageUrl: media.imageUrl,
      audioUrl: media.audioUrl,
      colorTag,
      isSuspended,
    };

    try {
      const result =
        mode === "create"
          ? await createCardAction(input)
          : await updateCardAction({ id: initialValues?.id ?? "", ...input });

      if (isError(result)) {
        setFormError(getErrorMessage(result[1].message, "No se pudo guardar la tarjeta"));
        return;
      }

      if (isSuccess(result)) {
        if (keepOpen && mode === "create") {
          resetForNextCard();
        }

        onSuccess(result[0].card, { keptOpen: keepOpen && mode === "create" });
      }
    } catch {
      setFormError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  }

  /** Ctrl+Enter guarda y, si es el formulario de alta, deja el formulario vacío. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();

      if (isLoading || !enableQuickCreate) {
        return;
      }

      keepOpenRef.current = true;
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-5" noValidate>
      {formError && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {formError}
        </div>
      )}

      <div>
        <label htmlFor="card-type" className={LABEL_CLASS}>
          Tipo de tarjeta
        </label>
        <select
          id="card-type"
          name="cardType"
          value={cardType}
          onChange={(event) => setCardType(event.target.value as CardType)}
          aria-invalid={hasError("cardType")}
          aria-describedby="card-type-hint"
          className={`mt-1 ${INPUT_CLASS} ${hasError("cardType") ? ERROR_INPUT_CLASS : ""}`}
        >
          {CARD_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p id="card-type-hint" className="mt-1 text-xs text-secondary-foreground">
          {CARD_TYPE_OPTIONS.find((option) => option.value === cardType)?.hint}
        </p>
        <FieldErrors id="card-type-errors" errors={fieldErrors.cardType} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="card-front" className={LABEL_CLASS}>
            {frontLabel} <span className="text-red-500">*</span>
          </label>
          <textarea
            ref={frontRef}
            id="card-front"
            name="front"
            rows={4}
            value={front}
            onChange={(event) => setFront(event.target.value)}
            maxLength={20000}
            aria-invalid={hasError("front")}
            aria-describedby={hasError("front") ? "card-front-errors" : undefined}
            className={`mt-1 font-mono text-sm ${INPUT_CLASS} ${hasError("front") ? ERROR_INPUT_CLASS : ""}`}
          />
          {cardType === "cloze" && (
            <p className="mt-1 text-xs text-secondary-foreground">
              Escribe los huecos como <code className="font-mono">{"{{c1::texto}}"}</code>.{" "}
              {clozeIndexes.length > 0 ? (
                <>
                  Esta tarjeta tiene {clozeIndexes.length} borrado
                  {clozeIndexes.length === 1 ? "" : "s"}:{" "}
                  {clozeIndexes.map((index) => index).join(", ")}.
                </>
              ) : (
                "Aún no has marcado ningún borrado."
              )}
            </p>
          )}
          {languageLabel && (
            <p className="mt-1 text-xs text-secondary-foreground">
              En el anverso va el texto en {languageLabel}; en el reverso, su traducción.
            </p>
          )}
          <FieldErrors id="card-front-errors" errors={fieldErrors.front} />
        </div>

        <div>
          <label htmlFor="card-back" className={LABEL_CLASS}>
            {cardType === "cloze" ? "Reverso (contexto opcional)" : "Reverso"}
          </label>
          <textarea
            id="card-back"
            name="back"
            rows={4}
            maxLength={20000}
            defaultValue={initialValues?.back ?? ""}
            aria-invalid={hasError("back")}
            aria-describedby={hasError("back") ? "card-back-errors" : undefined}
            className={`mt-1 font-mono text-sm ${INPUT_CLASS} ${hasError("back") ? ERROR_INPUT_CLASS : ""}`}
          />
          <FieldErrors id="card-back-errors" errors={fieldErrors.back} />
        </div>
      </div>

      {front.trim().length > 0 && (
        <details className="rounded-lg border border-border bg-secondary/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-secondary-foreground">
            Vista previa del anverso
          </summary>
          <div className="mt-3 space-y-2">
            {missingCloze ? (
              <p className="text-sm font-medium text-red-600">
                El anverso de una tarjeta cloze debe incluir al menos un borrado.
              </p>
            ) : (
              <CardPreview front={front} isCloze={cardType === "cloze"} />
            )}
          </div>
        </details>
      )}

      <div>
        <span className={LABEL_CLASS}>Campos personalizados</span>
        <p className="mt-1 text-xs text-secondary-foreground">
          Se guardan junto a la tarjeta y aparecerán al estudiarla.
        </p>
        <div className="mt-2">
          <CardExtraFieldsEditor fields={extraFields} onChange={setExtraFields} disabled={isLoading} />
        </div>
        <FieldErrors id="card-extra-fields-errors" errors={fieldErrors.extraFields} />
      </div>

      <div>
        <span className={LABEL_CLASS}>Adjuntos</span>
        <p className="mt-1 text-xs text-secondary-foreground">
          Imágenes y audios se guardan en tu cuenta y se adjuntan a la tarjeta.
        </p>
        <div className="mt-2">
          <CardMediaFields
            imageUrl={media.imageUrl}
            audioUrl={media.audioUrl}
            onChange={(next) => setMedia({ imageUrl: next.imageUrl, audioUrl: next.audioUrl })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={LABEL_CLASS}>Color</span>
          <p className="mt-1 text-xs text-secondary-foreground">Para localizar la tarjeta de un vistazo.</p>
          <div className="mt-2">
            <CardColorTagSelect value={colorTag} onChange={setColorTag} label="Color de la tarjeta" disabled={isLoading} />
          </div>
        </div>

        <div>
          <span className={LABEL_CLASS}>Estado</span>
          <label className="mt-2 flex items-center gap-2 text-sm text-secondary-foreground">
            <input
              type="checkbox"
              name="isSuspended"
              checked={isSuspended}
              onChange={(event) => setIsSuspended(event.target.checked)}
              disabled={isLoading}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            Suspender la tarjeta
          </label>
          <p className="mt-1 text-xs text-secondary-foreground">
            Las tarjetas suspendidas no aparecen en el estudio hasta reactivarlas.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading
            ? "Guardando..."
            : (submitLabel ?? (mode === "create" ? "Crear tarjeta" : "Guardar cambios"))}
        </button>

        {enableQuickCreate && mode === "create" && (
          <button
            type="button"
            onClick={() => {
              keepOpenRef.current = true;
              formRef.current?.requestSubmit();
            }}
            disabled={isLoading}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Guardar y crear otra
            <kbd className="ml-2 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
              Ctrl+Enter
            </kbd>
          </button>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}