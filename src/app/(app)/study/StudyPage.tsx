"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import StudyLaunchForm from "@/components/forms/StudyLaunchForm";
import { formatDateTime, formatNumber } from "@/lib/format";
import { STUDY_STATUS_LABELS } from "@/constants/study";
import type { StudyOverview } from "@/types/study";

interface StudyPageProps {
  overview: StudyOverview;
}

interface ResumeCardProps {
  overview: StudyOverview;
}

/** RF-020 / RF-021: la sesión abierta más reciente se puede retomar tal cual. */
function ResumeCard({ overview }: ResumeCardProps) {
  const { resumable } = overview;

  if (!resumable) {
    return null;
  }

  const { session, pendingCards } = resumable;

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-blue-500 bg-blue-50 p-5">
      <div>
        <h2 className="text-sm font-semibold text-blue-900">
          Sesión {STUDY_STATUS_LABELS[session.status].toLowerCase()}
          {session.deckName ? ` · ${session.deckName}` : " · Todos los mazos"}
        </h2>
        <p className="mt-1 text-sm text-blue-900">
          Quedan {formatNumber(pendingCards)} tarjeta(s) · empezada el {formatDateTime(session.startedAt)}
        </p>
      </div>

      <Link
        href={`/study/session/${session.id}`}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Reanudar sesión
      </Link>
    </section>
  );
}

/**
 * Panel de estudio (spec 05): qué hay pendiente, con qué límites, y el arranque de
 * la sesión. La interfaz de tarjetas en sí vive en `/study/session/[sessionId]`.
 */
export default function StudyPage({ overview }: StudyPageProps) {
  const searchParams = useSearchParams();
  const deckParam = searchParams.get("deck");
  const initialDeckId =
    deckParam && overview.decks.some((deck) => deck.id === deckParam) ? deckParam : null;
  const deckOption = initialDeckId
    ? (overview.decks.find((deck) => deck.id === initialDeckId) ?? null)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Estudio</h1>
        <p className="max-w-3xl text-sm text-secondary-foreground">
          Repasa las tarjetas que vencen hoy, adelanta las próximas o haz un repaso libre del mazo. Las
          calificaciones se guardan y se aplican al scheduling en el momento.
        </p>
      </header>

      <ResumeCard overview={overview} />

      <StudyLaunchForm
        decks={overview.decks}
        limits={overview.limits}
        initialDeckId={initialDeckId}
        initialCounts={deckOption ? { ...deckOption.counts, upcoming: deckOption.upcoming } : overview.allDecks}
      />

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
        <p className="text-sm text-secondary-foreground">
          Historial de sesiones, tarjetas por día y precisión acumulada.
        </p>
        <Link
          href="/study/history"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
        >
          Ver historial
        </Link>
      </section>
    </div>
  );
}