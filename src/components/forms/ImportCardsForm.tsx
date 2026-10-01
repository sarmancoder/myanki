"use client";

import { useState } from "react";
import { importDeckAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { DUPLICATE_STRATEGY_LABELS, MAX_IMPORT_LENGTH } from "@/lib/validation/deck";
import type { ImportResult } from "@/types/deck";

interface ImportCardsFormProps {
  /** Mazo destino. Si se omite, se crea un mazo nuevo con los datos del archivo. */
  deckId?: string;
  onSuccess: (result: ImportResult) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  "block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";
const LABEL_CLASS = "block text-sm font-medium text-primary";

export default function ImportCardsForm({ deckId, onSuccess, onCancel }: ImportCardsFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [format, setFormat] = useState<"auto" | "json" | "csv">("auto");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      setError("Selecciona un archivo JSON o CSV");
      return;
    }

    const content = await file.text();

    if (content.length > MAX_IMPORT_LENGTH) {
      setError("El archivo supera el tamaño máximo permitido");
      return;
    }

    const resolvedFormat =
      format === "auto"
        ? file.name.toLowerCase().endsWith(".csv")
          ? "csv"
          : "json"
        : format;

    const duplicateStrategy = String(formData.get("duplicateStrategy") ?? "skip");

    setIsLoading(true);

    const result = await importDeckAction({
      deckId,
      format: resolvedFormat,
      content,
      fileName: file.name,
      duplicateStrategy: duplicateStrategy as "skip" | "replace" | "copy",
    });

    setIsLoading(false);

    if (isError(result)) {
      setError(getErrorMessage(result[1].message, "No se pudo importar el archivo"));
      return;
    }

    if (isSuccess(result)) {
      onSuccess(result[0]);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="import-file" className={LABEL_CLASS}>
          Archivo JSON o CSV
        </label>
        <input
          id="import-file"
          name="file"
          type="file"
          accept=".json,.csv,application/json,text/csv"
          required
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          className={`mt-1 ${INPUT_CLASS} file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-primary`}
        />
        <p className="mt-1 text-xs text-secondary">
          El CSV debe incluir las columnas <code>front</code> y <code>back</code>.
        </p>
      </div>

      <div>
        <label htmlFor="import-format" className={LABEL_CLASS}>
          Formato del archivo
        </label>
        <select
          id="import-format"
          name="format"
          value={format}
          onChange={(event) => setFormat(event.target.value as "auto" | "json" | "csv")}
          className={`mt-1 ${INPUT_CLASS}`}
        >
          <option value="auto">Detectar por extensión</option>
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
        </select>
      </div>

      <div>
        <label htmlFor="import-duplicates" className={LABEL_CLASS}>
          Tarjetas duplicadas (mismo anverso)
        </label>
        <select
          id="import-duplicates"
          name="duplicateStrategy"
          defaultValue="skip"
          className={`mt-1 ${INPUT_CLASS}`}
        >
          {Object.entries(DUPLICATE_STRATEGY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-secondary">
          Los duplicados se detectan por el anverso de la tarjeta dentro del mazo destino.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? "Importando..." : "Importar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
        >
          Cancelar
        </button>
        {fileName && <span className="text-xs text-secondary">Archivo: {fileName}</span>}
      </div>
    </form>
  );
}