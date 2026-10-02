"use client";

import { useState } from "react";
import { z } from "zod";
import { createLanguageAction, updateLanguageAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { languageCodeSchema, languageNameSchema } from "@/lib/validation/language";
import type { LanguageView } from "@/types/language";

const languageFormSchema = z.object({
  name: languageNameSchema,
  // Al crear, el código es obligatorio y se normaliza a minúsculas. Al editar el
  // código no se toca: renombrar el idioma no debe romper las URL ni las importaciones.
  code: z.union([
    z.literal(""),
    languageCodeSchema,
  ]),
});

export interface LanguageFormInitialValues {
  /** Id del idioma en edición; en el alta no se envía. */
  id?: string;
  name: string;
  code?: string;
  flag: string;
}

interface LanguageFormProps {
  mode: "create" | "edit";
  initialValues?: LanguageFormInitialValues;
  submitLabel?: string;
  /** Se llama con el idioma guardado para que la lista se actualice. */
  onSuccess: (language: LanguageView) => void;
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

/** Errores de un campo, todos a la vez, justo debajo de su input. */
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

export default function LanguageForm({
  mode,
  initialValues,
  submitLabel,
  onSuccess,
  onCancel,
}: LanguageFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const values = {
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? ""),
      flag: String(formData.get("flag") ?? ""),
    };

    const parsed = languageFormSchema.safeParse(values);

    if (!parsed.success) {
      const errors: Record<string, string[]> = {};

      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        errors[field] = [...(errors[field] ?? []), issue.message];
      }

      setFieldErrors(errors);
      return;
    }

    if (mode === "create" && parsed.data.code === "") {
      setFieldErrors({ code: ["El código del idioma es obligatorio"] });
      return;
    }

    setFieldErrors({});
    setIsLoading(true);

    try {
      const result =
        mode === "create"
          ? await createLanguageAction({
              name: parsed.data.name,
              code: parsed.data.code,
              flag: values.flag,
            })
          : await updateLanguageAction({
              id: initialValues?.id ?? "",
              name: parsed.data.name,
              flag: values.flag,
            });

      if (isError(result)) {
        setFormError(getErrorMessage(result[1].message, "No se pudo guardar el idioma"));
        return;
      }

      if (isSuccess(result)) {
        onSuccess(result[0].language);
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

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "create" && (
          <div>
            <label htmlFor="language-code" className={LABEL_CLASS}>
              Código <span className="text-red-500">*</span>
            </label>
            <input
              id="language-code"
              name="code"
              type="text"
              maxLength={10}
              placeholder="de"
              defaultValue={initialValues?.code ?? ""}
              aria-invalid={hasError("code")}
              aria-describedby={hasError("code") ? "language-code-errors" : "language-code-hint"}
              className={`mt-1 ${INPUT_CLASS} ${hasError("code") ? ERROR_INPUT_CLASS : ""}`}
            />
            <p id="language-code-hint" className="mt-1 text-xs text-secondary-foreground">
              Código ISO 639-1 en minúsculas, por ejemplo <strong>de</strong> o <strong>pt</strong>.
            </p>
            <FieldErrors id="language-code-errors" errors={fieldErrors.code} />
          </div>
        )}

        <div>
          <label htmlFor="language-name" className={LABEL_CLASS}>
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            id="language-name"
            name="name"
            type="text"
            maxLength={40}
            placeholder="Alemán"
            defaultValue={initialValues?.name ?? ""}
            aria-invalid={hasError("name")}
            aria-describedby={hasError("name") ? "language-name-errors" : undefined}
            className={`mt-1 ${INPUT_CLASS} ${hasError("name") ? ERROR_INPUT_CLASS : ""}`}
          />
          <FieldErrors id="language-name-errors" errors={fieldErrors.name} />
        </div>

        <div>
          <label htmlFor="language-flag" className={LABEL_CLASS}>
            Bandera
          </label>
          <input
            id="language-flag"
            name="flag"
            type="text"
            maxLength={8}
            placeholder="🇩🇪"
            defaultValue={initialValues?.flag ?? ""}
            className={`mt-1 ${INPUT_CLASS}`}
          />
          <p className="mt-1 text-xs text-secondary-foreground">Un emoji, opcional.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading
            ? "Guardando..."
            : (submitLabel ?? (mode === "create" ? "Añadir idioma" : "Guardar cambios"))}
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