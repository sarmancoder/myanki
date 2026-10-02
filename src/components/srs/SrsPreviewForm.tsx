"use client";

import { useState } from "react";
import { CARD_STATUSES, CARD_STATUS_LABELS, type CardStatus } from "@/constants/cards";
import {
  DEFAULT_INITIAL_EASE_FACTOR,
  DEFAULT_MAX_INTERVAL_DAYS,
  SRS_ALGORITHM_LABELS,
} from "@/constants/srs";
import { calculateSrsAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import IntervalPreviewTable, { LapseWarning, PreviewStateHint } from "@/components/srs/IntervalPreviewTable";
import type { SrsRatingPreview, SrsSettingsView } from "@/types/srs";

const INPUT_CLASS =
  "block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";
const LABEL_CLASS = "block text-sm font-medium text-primary";

interface SrsPreviewFormProps {
  settings: SrsSettingsView;
}

/**
 * Simulador del planificador (RF-008): permite ver los cuatro intervalos que
 * resultarían a partir de un estado de tarjeta sin tocar ningún dato. La
 * configuración guardada se usa como base, así que cambiar el algoritmo o el
 * intervalo máximo se refleja al instante.
 */
export default function SrsPreviewForm({ settings }: SrsPreviewFormProps) {
  const [status, setStatus] = useState<CardStatus>("review");
  const [intervalDays, setIntervalDays] = useState(10);
  const [lapses, setLapses] = useState(0);
  const [previews, setPreviews] = useState<SrsRatingPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await calculateSrsAction({
        state: {
          status,
          intervalDays,
          easeFactor: settings.initialEaseFactor || DEFAULT_INITIAL_EASE_FACTOR,
          repetitions: status === "new" ? 0 : 3,
          lapses,
          elapsedDays: status === "review" ? intervalDays : 0,
        },
      });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo calcular los intervalos"));
        return;
      }

      if (isSuccess(result)) {
        setPreviews(result[0].previews);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="preview-status" className={LABEL_CLASS}>
            Estado de la tarjeta
          </label>
          <select
            id="preview-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as CardStatus)}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            {CARD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CARD_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="preview-interval" className={LABEL_CLASS}>
            Intervalo actual (días)
          </label>
          <input
            id="preview-interval"
            name="intervalDays"
            type="number"
            min={0}
            max={settings.maxIntervalDays || DEFAULT_MAX_INTERVAL_DAYS}
            value={status === "review" ? intervalDays : 0}
            disabled={status !== "review"}
            onChange={(event) => setIntervalDays(Number(event.target.value) || 0)}
            className={`mt-1 ${INPUT_CLASS} disabled:opacity-60`}
          />
        </div>

        <div>
          <label htmlFor="preview-lapses" className={LABEL_CLASS}>
            Lapses acumulados
          </label>
          <input
            id="preview-lapses"
            name="lapses"
            type="number"
            min={0}
            max={100}
            value={lapses}
            onChange={(event) => setLapses(Number(event.target.value) || 0)}
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? "Calculando..." : "Calcular intervalos"}
        </button>
        <p className="text-xs text-secondary-foreground">
          Usa {SRS_ALGORITHM_LABELS[settings.algorithm]} con un factor de{" "}
          {settings.initialEaseFactor.toFixed(2)}.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <LapseWarning lapses={lapses} />

      {previews.length > 0 && (
        <div className="space-y-2">
          <IntervalPreviewTable previews={previews} />
          <PreviewStateHint status={status} intervalDays={status === "review" ? intervalDays : 0} />
        </div>
      )}
    </form>
  );
}