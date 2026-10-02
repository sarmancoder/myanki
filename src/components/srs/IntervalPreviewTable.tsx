"use client";

import {
  LAPSE_REVIEW_THRESHOLD,
  SRS_RATING_LABELS,
  SRS_RATING_SHORTCUTS,
  type SrsRating,
} from "@/constants/srs";
import type { CardStatus } from "@/constants/cards";
import { CARD_STATUS_LABELS } from "@/constants/cards";
import { formatDateTime } from "@/lib/format";
import type { SrsRatingPreview } from "@/types/srs";

/** Colores contextuales por calificación, alineados con los botones de estudio. */
const ROW_CLASS: Record<SrsRating, string> = {
  again: "border-red-200 bg-red-50",
  hard: "border-amber-200 bg-amber-50",
  good: "border-green-200 bg-green-50",
  easy: "border-blue-200 bg-blue-50",
};

const TEXT_CLASS: Record<SrsRating, string> = {
  again: "text-red-700",
  hard: "text-amber-700",
  good: "text-green-700",
  easy: "text-blue-700",
};

interface IntervalPreviewTableProps {
  previews: SrsRatingPreview[];
}

/**
 * Intervalos estimados que el usuario verá antes de calificar (RF-008), con los
 * atajos de teclado de cada botón (RF-007).
 */
export default function IntervalPreviewTable({ previews }: IntervalPreviewTableProps) {
  if (previews.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-background p-4 text-sm text-secondary-foreground">
        Todavía no hay intervalos que previsualizar.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Intervalo estimado para cada calificación</caption>
        <thead>
          <tr className="border-b border-border bg-secondary/40 text-left">
            <th scope="col" className="px-3 py-2 font-medium text-primary">
              Calificación
            </th>
            <th scope="col" className="px-3 py-2 font-medium text-primary">
              Atajo
            </th>
            <th scope="col" className="px-3 py-2 font-medium text-primary">
              Intervalo
            </th>
            <th scope="col" className="px-3 py-2 font-medium text-primary">
              Estado resultante
            </th>
            <th scope="col" className="px-3 py-2 font-medium text-primary">
              Próxima fecha
            </th>
          </tr>
        </thead>
        <tbody>
          {previews.map((preview) => (
            <tr key={preview.rating} className={`border-b border-border last:border-b-0 ${ROW_CLASS[preview.rating]}`}>
              <td className={`px-3 py-2 font-medium ${TEXT_CLASS[preview.rating]}`}>
                {SRS_RATING_LABELS[preview.rating]}
              </td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap gap-1">
                  {SRS_RATING_SHORTCUTS[preview.rating].map((shortcut) => (
                    <kbd
                      key={shortcut}
                      className="rounded bg-background px-1.5 py-0.5 font-mono text-xs text-primary ring-1 ring-border"
                    >
                      {shortcut}
                    </kbd>
                  ))}
                </span>
              </td>
              <td className={`px-3 py-2 font-semibold ${TEXT_CLASS[preview.rating]}`}>
                {preview.intervalLabel}
              </td>
              <td className="px-3 py-2 text-secondary-foreground">
                {CARD_STATUS_LABELS[preview.status]}
              </td>
              <td className="px-3 py-2 text-secondary-foreground">
                {formatDateTime(preview.dueDate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LapseWarningProps {
  lapses: number;
}

/** Aviso de RF-017: demasiados lapses suelen indicar una tarjeta que hay que rehacer. */
export function LapseWarning({ lapses }: LapseWarningProps) {
  if (lapses <= LAPSE_REVIEW_THRESHOLD) {
    return null;
  }

  return (
    <div className="rounded-lg border border-yellow-500 bg-yellow-50 p-3 text-sm text-yellow-800" role="alert">
      <p className="font-medium">Esta tarjeta acumula {lapses} lapses.</p>
      <p className="mt-1">
        Por encima de {LAPSE_REVIEW_THRESHOLD} conviene revisar su contenido: puede estar mal formulada o ser
        demasiado difícil.
      </p>
    </div>
  );
}

interface PreviewStateHintProps {
  status: CardStatus;
  intervalDays: number;
}

/** Describe el estado simulado que se está previsualizando. */
export function PreviewStateHint({ status, intervalDays }: PreviewStateHintProps) {
  return (
    <p className="text-xs text-secondary-foreground">
      Simulación de una tarjeta en estado <strong>{CARD_STATUS_LABELS[status]}</strong>
      {intervalDays > 0 ? ` con ${intervalDays} días de intervalo` : ""}.
    </p>
  );
}