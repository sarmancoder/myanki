import type { CardStatus, CardStatusFilter } from "@/constants/cards";
import { CARD_STATUS_FILTER_LABELS } from "@/constants/cards";

interface StatusBadgeProps {
  status: CardStatusFilter;
  /** Cuando es `true` se muestra el texto largo del filtro ("En aprendizaje"). */
  long?: boolean;
}

const SHORT_LABELS: Record<CardStatus, string> = {
  new: "Nueva",
  learning: "Aprendiendo",
  review: "Aprendida",
  relearning: "Reaprendiendo",
};

/**
 * Una tarjeta suspendida tiene estado de SRS pero no estudia: el badge combina
 * ambos estados para que la fila nunca resulte ambigua.
 */
export default function StatusBadge({ status, long = false }: StatusBadgeProps) {
  if (status === "suspended") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-800">
        Suspendida
      </span>
    );
  }

  if (status === "all") {
    return null;
  }

  const label = long ? CARD_STATUS_FILTER_LABELS[status] : SHORT_LABELS[status];

  const className =
    status === "new"
      ? "bg-blue-100 text-blue-700"
      : status === "review"
        ? "bg-green-100 text-green-700"
        : status === "relearning"
          ? "bg-orange-100 text-orange-700"
          : "bg-secondary text-secondary-foreground-foreground";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}