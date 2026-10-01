"use client";

import { useState } from "react";
import { SUGGESTED_EXTRA_FIELDS } from "@/constants/cards";
import { MAX_EXTRA_FIELDS } from "@/lib/validation/card";

export interface ExtraFieldDraft {
  /** Identificador estable para React; no se envía al servidor. */
  rowId: string;
  key: string;
  value: string;
}

interface CardExtraFieldsEditorProps {
  fields: ExtraFieldDraft[];
  onChange: (fields: ExtraFieldDraft[]) => void;
  disabled?: boolean;
}

let rowCounter = 0;

function createRow(key = "", value = ""): ExtraFieldDraft {
  rowCounter += 1;

  return { rowId: `field-${rowCounter}`, key, value };
}

/** Convierte los campos guardados (objeto) en filas editables. */
export function toExtraFieldDrafts(fields: Record<string, string>): ExtraFieldDraft[] {
  return Object.entries(fields).map(([key, value]) => createRow(key, value));
}

const INPUT_CLASS =
  "block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";

/**
 * Editor de campos personalizados (Pronunciación, Ejemplo, Nota...).
 *
 * Las filas viven en estado porque su número es dinámico; el resultado se
 * serializa a JSON en un input oculto que el formulario uncontrolled lee al enviarse.
 */
export default function CardExtraFieldsEditor({
  fields,
  onChange,
  disabled = false,
}: CardExtraFieldsEditorProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const existingKeys = new Set(fields.map((field) => field.key.trim().toLowerCase()));
  const suggestions = SUGGESTED_EXTRA_FIELDS.filter(
    (suggestion) => !existingKeys.has(suggestion.key)
  );

  function updateRow(rowId: string, patch: Partial<ExtraFieldDraft>) {
    onChange(fields.map((field) => (field.rowId === rowId ? { ...field, ...patch } : field)));
  }

  function addRow(key = "", value = "") {
    if (fields.length >= MAX_EXTRA_FIELDS) {
      return;
    }

    onChange([...fields, createRow(key, value)]);
  }

  function removeRow(rowId: string) {
    onChange(fields.filter((field) => field.rowId !== rowId));
  }

  return (
    <div className="space-y-3">
      {fields.length === 0 && (
        <p className="text-xs text-secondary-foreground">
          Sin campos personalizados. Puedes añadir pronunciación, un ejemplo de uso o una nota.
        </p>
      )}

      <ul className="space-y-2">
        {fields.map((field) => (
          <li key={field.rowId} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={field.key}
              onChange={(event) => updateRow(field.rowId, { key: event.target.value })}
              placeholder="Nombre (ej. pronunciación)"
              maxLength={40}
              disabled={disabled}
              aria-label="Nombre del campo personalizado"
              className={`${INPUT_CLASS} w-full sm:w-44`}
            />
            <input
              type="text"
              value={field.value}
              onChange={(event) => updateRow(field.rowId, { value: event.target.value })}
              placeholder="Valor"
              maxLength={5000}
              disabled={disabled}
              aria-label="Valor del campo personalizado"
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => removeRow(field.rowId)}
              disabled={disabled}
              className="rounded-lg border border-red-300 px-2.5 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => addRow()}
          disabled={disabled || fields.length >= MAX_EXTRA_FIELDS}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          + Añadir campo
        </button>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSuggestions((current) => !current)}
              disabled={disabled}
              className="text-xs font-medium text-primary underline underline-offset-2 disabled:opacity-50"
            >
              {showSuggestions ? "Ocultar sugerencias" : "Sugerencias"}
            </button>

            {showSuggestions && (
              <span className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.key}
                    type="button"
                    onClick={() => addRow(suggestion.key)}
                    disabled={disabled || fields.length >= MAX_EXTRA_FIELDS}
                    className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    + {suggestion.label}
                  </button>
                ))}
              </span>
            )}
          </div>
        )}

        {fields.length >= MAX_EXTRA_FIELDS && (
          <span className="text-xs text-secondary-foreground">
            Máximo {MAX_EXTRA_FIELDS} campos por tarjeta.
          </span>
        )}
      </div>
    </div>
  );
}