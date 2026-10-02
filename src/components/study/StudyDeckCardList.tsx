"use client";

import { getCardTypeLabel } from "@/constants/cards";
import { formatDate, formatNumber } from "@/lib/format";
import { sortExtraFields } from "@/lib/cards/extra-fields";
import CardPreview from "@/components/cards/CardPreview";
import CardStatusBadge from "@/components/cards/CardStatusBadge";
import Markdown from "@/components/ui/Markdown";
import type { StudyDeckCardView } from "@/types/study";

interface StudyDeckCardListProps {
  cards: StudyDeckCardView[];
}

function CardRow({ card }: { card: StudyDeckCardView }) {
  const extraFields = sortExtraFields(card.extraFields);
  const isCloze = card.cardType === "cloze";

  return (
    <li className="border-b border-border last:border-b-0">
      <div className="grid gap-3 px-4 py-3 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground">
            Anverso
          </p>
          <CardPreview front={card.front} isCloze={isCloze} clamp={3} />
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-secondary-foreground">
            Reverso
          </p>
          {card.back.trim().length > 0 ? (
            <Markdown clamp={3}>{card.back}</Markdown>
          ) : (
            <span className="text-sm text-secondary-foreground">—</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 text-xs text-secondary-foreground">
        <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground-foreground">
          {getCardTypeLabel(card.cardType)}
        </span>
        <CardStatusBadge status={card.isSuspended ? "suspended" : card.status} />
        <span>
          Estudios: <strong className="font-semibold text-primary">{formatNumber(card.studyCount)}</strong>
        </span>
        {card.dueDate && !card.isSuspended && (
          <span>Próximo repaso: {formatDate(card.dueDate)}</span>
        )}
        <span>Creada: {formatDate(card.createdAt)}</span>
        {extraFields.map(([key, value]) => (
          <span key={key} className="rounded bg-secondary px-2 py-0.5">
            <span className="font-medium text-primary">{key}:</span> {value}
          </span>
        ))}
      </div>
    </li>
  );
}

/**
 * Listado completo de las tarjetas del mazo (RF-024): lo que hay que responder en
 * la sesión, con cuántas veces se ha estudiado cada una y cuándo toca repasarla.
 */
export default function StudyDeckCardList({ cards }: StudyDeckCardListProps) {
  if (cards.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
        <h2 className="text-sm font-semibold text-primary">Este mazo no tiene tarjetas</h2>
        <p className="mt-1 text-sm text-secondary-foreground">
          Añade tarjetas desde la ficha del mazo para poder estudiarlo.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-primary">
        Todas las tarjetas ({formatNumber(cards.length)})
      </h2>

      <ul className="overflow-hidden rounded-lg border border-border bg-background">
        {cards.map((card) => (
          <CardRow key={card.id} card={card} />
        ))}
      </ul>
    </section>
  );
}