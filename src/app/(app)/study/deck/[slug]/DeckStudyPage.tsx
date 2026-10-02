"use client";

import Link from "next/link";
import StudyDeckCardList from "@/components/study/StudyDeckCardList";
import StudyDeckLaunchForm from "@/components/forms/StudyDeckLaunchForm";
import { formatDate, formatNumber } from "@/lib/format";
import type { StudyDeckCardsResult } from "@/types/study";
import type { DeckSummary, DeckOption } from "@/types/deck";

interface DeckStudyPageProps {
  deck: DeckSummary;
  ancestors: DeckOption[];
  cards: StudyDeckCardsResult;
}

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}

function StatCard({ label, value, hint, accent = false }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-blue-600" : "text-primary"}`}>{value}</p>
      <p className="mt-1 text-xs text-secondary-foreground">{hint}</p>
    </div>
  );
}

/**
 * Pantalla de estudio de un mazo (RF-024): el listado completo de sus tarjetas y,
 * desde aquí, el arranque de la sesión. La sesión no tiene límite, así que esta
 * misma pantalla sirve para repetir el mazo cuantas veces se quiera.
 */
export default function DeckStudyPage({ deck, ancestors, cards }: DeckStudyPageProps) {
  const hasSubDecks = cards.subDeckCount > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-secondary-foreground">
          <Link href="/study" className="hover:underline">
            Estudio
          </Link>
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              <span>/</span>
              <Link href={`/study/deck/${ancestor.slug}`} className="hover:underline">
                {ancestor.name}
              </Link>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span>/</span>
            <span className="font-medium text-primary">{deck.name}</span>
          </span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">{deck.name}</h1>
            <p className="text-sm text-secondary-foreground">
              Todas las tarjetas del mazo y el botón de estudio.{" "}
              {deck.lastStudiedAt
                ? `Último estudio: ${formatDate(deck.lastStudiedAt)}.`
                : "Todavía no lo has estudiado."}
            </p>
          </div>

          <Link
            href={`/decks/${deck.slug}/cards`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Gestionar tarjetas
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tarjetas"
          value={formatNumber(hasSubDecks ? cards.branchTotalCards : deck.stats.total)}
          hint={
            hasSubDecks
              ? `${formatNumber(deck.stats.total)} del mazo y ${formatNumber(cards.subDeckCount)} sub-mazo(s)`
              : "Solo este mazo"
          }
        />
        <StatCard
          label="Nuevas"
          value={formatNumber(cards.counts.new)}
          hint="Sin estudiar todavía"
          accent={cards.counts.new > 0}
        />
        <StatCard
          label="En aprendizaje"
          value={formatNumber(cards.counts.learning)}
          hint="Pendientes de graduar"
        />
        <StatCard
          label="Aprendidas"
          value={formatNumber(cards.counts.review)}
          hint="Con intervalo de días"
        />
      </section>

      <StudyDeckLaunchForm
        deckId={deck.id}
        deckName={deck.name}
        cardCount={deck.stats.total}
        branchTotalCards={cards.branchTotalCards}
        subDeckCount={cards.subDeckCount}
        hasSubDecks={hasSubDecks}
      />

      <StudyDeckCardList cards={cards.cards} />
    </div>
  );
}