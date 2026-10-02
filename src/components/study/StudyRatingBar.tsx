"use client";

import { SRS_RATING_OPTIONS, SRS_RATING_SHORTCUTS } from "@/constants/srs";
import { previewIntervals } from "@/lib/srs/algorithm";
import { toScheduleState } from "@/lib/srs/serialize";
import type { SrsRating } from "@/constants/srs";
import type { StudyCardView, StudySrsScheduleSettings } from "@/types/study";

interface StudyRatingBarProps {
  card: StudyCardView;
  settings: StudySrsScheduleSettings;
  isCramMode: boolean;
  disabled: boolean;
  onRate: (rating: SrsRating) => void;
}

/**
 * Barra de calificación (RF-008): los cuatro botones con el intervalo que le
 * correspondería a cada respuesta.
 *
 * El intervalo se calcula en el navegador con el mismo planificador que usa el
 * servidor (`previewIntervals`), así que los botones reflejan la configuración
 * guardada sin esperar una ida y vuelta por cada tarjeta.
 */
export default function StudyRatingBar({
  card,
  settings,
  isCramMode,
  disabled,
  onRate,
}: StudyRatingBarProps) {
  const now = new Date();

  const previews = previewIntervals(
    toScheduleState(
      {
        status: card.scheduling.status,
        easeFactor: card.scheduling.easeFactor,
        intervalDays: card.scheduling.intervalDays,
        repetitions: card.scheduling.repetitions,
        lapses: card.scheduling.lapses,
        lastReviewedAt: card.scheduling.lastReviewedAt
          ? new Date(card.scheduling.lastReviewedAt)
          : null,
      },
      now
    ),
    settings,
    now
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {SRS_RATING_OPTIONS.map((option) => {
        const preview = previews.find((item) => item.rating === option.value);

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onRate(option.value)}
            title={option.hint}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${option.buttonClassName}`}
          >
            <span>{option.label}</span>
            <span className="text-xs font-normal opacity-90">
              {isCramMode ? "Sin efecto" : (preview?.intervalLabel ?? "—")}
            </span>
            <span className="text-[10px] font-normal uppercase opacity-70">
              {SRS_RATING_SHORTCUTS[option.value][0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}