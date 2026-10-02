"use client";

import { SRS_YES_NO_OPTIONS } from "@/constants/srs";
import { previewIntervals } from "@/lib/srs/algorithm";
import { toScheduleState } from "@/lib/srs/serialize";
import type { SrsRating } from "@/constants/srs";
import type { StudyCardView, StudySrsScheduleSettings } from "@/types/study";

interface StudyYesNoBarProps {
  card: StudyCardView;
  settings: StudySrsScheduleSettings;
  isCramMode: boolean;
  disabled: boolean;
  onRate: (rating: SrsRating) => void;
}

/**
 * Barra de calificación: dos botones, "Sí" y "No" (RF-025). Cada uno muestra el
 * intervalo que le correspondería a esa respuesta, calculado en el navegador con
 * el mismo planificador que usa el servidor (`previewIntervals`), así que los
 * botones reflejan la configuración guardada sin ir y volver por cada tarjeta.
 *
 * "Sí" se guarda como `good` y "No" como `again`: son las dos calificaciones que
 * el usuario puede expresar, pero el SRS sigue hablando en los cuatro grados.
 */
export default function StudyYesNoBar({
  card,
  settings,
  isCramMode,
  disabled,
  onRate,
}: StudyYesNoBarProps) {
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
    <div className="grid grid-cols-2 gap-3">
      {SRS_YES_NO_OPTIONS.map((option) => {
        const preview = previews.find((item) => item.rating === option.rating);

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onRate(option.rating)}
            title={option.hint}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${option.buttonClassName}`}
          >
            <span>{option.label}</span>
            <span className="text-xs font-normal opacity-90">
              {isCramMode ? "Sin efecto" : (preview?.intervalLabel ?? "—")}
            </span>
            <span className="text-[10px] font-normal uppercase opacity-70">
              {option.shortcuts[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}