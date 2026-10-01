"use client";

import { useMemo, useState } from "react";
import { CARD_TYPE_OPTIONS, type CardType } from "@/constants/cards";
import { createCardsBatchAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { parseBatchCards } from "@/lib/cards/batch";
import { MAX_BATCH_CARDS } from "@/lib/validation/card";
import type { BatchCreateResult } from "@/types/card";

interface BatchCardsFormProps {
  deckId: string;
  onSuccess: (result: BatchCreateResult) => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  "block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";

const EXAMPLE = `bonjour\thola
merci\tgracias
au revoir\tadiós`;

/**
 * Alta masiva: una tarjeta por línea con `anverso<TAB>reverso` (o `anverso -> reverso`).
 *
 * El texto se analiza en el cliente con el mismo parser que usa el servidor, así
 * que la vista previa y el resultado real nunca divergen.
 */
export default function BatchCardsForm({ deckId, onSuccess, onCancel }: BatchCardsFormProps) {
  const [content, setContent] = useState("");
  const [cardType, setCardType] = useState<CardType>("basic");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseBatchCards(content), [content]);
  const canSubmit = parsed.cards.length > 0 && !isLoading;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await createCardsBatchAction({ deckId, content, cardType });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudieron crear las tarjetas"));
        return;
      }

      if (isSuccess(result)) {
        onSuccess(result[0]);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  }

  const typeHint = CARD_TYPE_OPTIONS.find((option) => option.value === cardType)?.hint;

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-secondary-foreground">
        <p>
          Una tarjeta por línea. Separa anverso y reverso con un{" "}
          <strong className="font-semibold text-primary">tabulador</strong> o con{" "}
          <code className="font-mono">{" -> "}</code>. Las líneas vacías y las que empiezan por{" "}
          <code className="font-mono">#</code> se ignoran. Máximo {MAX_BATCH_CARDS} tarjetas.
        </p>
        <pre className="mt-2 overflow-x-auto whitespace-pre font-mono text-[11px] text-primary">{EXAMPLE}</pre>
      </div>

      <div>
        <label htmlFor="batch-card-type" className="block text-sm font-medium text-primary">
          Tipo de tarjeta
        </label>
        <select
          id="batch-card-type"
          name="cardType"
          value={cardType}
          onChange={(event) => setCardType(event.target.value as CardType)}
          className={`mt-1 ${INPUT_CLASS}`}
        >
          {CARD_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-secondary-foreground">{typeHint}</p>
      </div>

      <div>
        <label htmlFor="batch-content" className="block text-sm font-medium text-primary">
          Tarjetas <span className="text-red-500">*</span>
        </label>
        <textarea
          id="batch-content"
          name="content"
          rows={12}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={EXAMPLE}
          aria-describedby="batch-summary"
          className={`mt-1 font-mono text-sm ${INPUT_CLASS}`}
        />

        <div id="batch-summary" className="mt-2 space-y-2">
          <p className="text-xs text-secondary-foreground">
            {parsed.cards.length} tarjeta{parsed.cards.length === 1 ? "" : "s"} lista
            {parsed.cards.length === 1 ? "" : "s"}
            {parsed.ignored > 0 ? ` · ${parsed.ignored} línea(s) ignorada(s)` : ""}
          </p>

          {parsed.failures.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3">
              {parsed.failures.slice(0, 8).map((failure) => (
                <li key={`${failure.line}-${failure.message}`} className="text-xs text-red-700">
                  <strong className="font-semibold">Línea {failure.line}:</strong> {failure.message}
                </li>
              ))}
              {parsed.failures.length > 8 && (
                <li className="text-xs text-red-700">
                  …y {parsed.failures.length - 8} línea(s) más con errores.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading
            ? "Creando..."
            : `Crear ${parsed.cards.length} tarjeta${parsed.cards.length === 1 ? "" : "s"}`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}