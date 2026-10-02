"use client";

import { STUDY_COUNT_LABELS, type StudyCountBucket } from "@/constants/study";
import { formatDuration, formatNumber } from "@/lib/format";
import type { StudyQueueCounts } from "@/types/study";

const BUCKET_CLASSES: Record<StudyCountBucket, string> = {
  new: "text-blue-600",
  learning: "text-amber-600",
  review: "text-green-600",
};

const BUCKETS: StudyCountBucket[] = ["new", "learning", "review"];

interface StudyCountersProps {
  counts: StudyQueueCounts;
  /** Tiempo transcurrido de la sesión, en milisegundos (RF-014). */
  elapsedMs: number;
  /** Tarjetas ya contestadas en la sesión. */
  answered: number;
}

/**
 * Cabecera de la sesión: cuántas tarjetas quedan por tipo y cuánto tiempo lleva el
 * usuario estudiando (RF-012, RF-013, RF-014).
 */
export default function StudyCounters({ counts, elapsedMs, answered }: StudyCountersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-sm text-secondary-foreground">
          <strong className="text-lg font-semibold text-primary">{formatNumber(counts.remaining)}</strong>{" "}
          restantes
        </span>

        {BUCKETS.map((bucket) => (
          <span key={bucket} className="text-xs text-secondary-foreground">
            {STUDY_COUNT_LABELS[bucket]}:{" "}
            <strong className={`font-semibold ${BUCKET_CLASSES[bucket]}`}>
              {formatNumber(counts[bucket])}
            </strong>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4 text-xs text-secondary-foreground">
        <span>
          Respondidas: <strong className="font-semibold text-primary">{formatNumber(answered)}</strong>
        </span>
        <span className="font-mono text-sm text-primary" aria-label="Tiempo de sesión">
          {formatDuration(elapsedMs)}
        </span>
      </div>
    </div>
  );
}