"use client";

import Link from "next/link";
import StudyDeckPicker from "@/components/study/StudyDeckPicker";
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
 * Panel de estudio (spec 05): desde aquí se elige el mazo y se entra en su
 * pantalla, donde están todas sus tarjetas y el botón de estudiar. Puedes estudiar
 * un mazo tantas veces como quieras; no hay cupos diarios.
 */
export default function StudyPage({ overview }: StudyPageProps) {
  const { allDecks } = overview;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Estudio</h1>
        <p className="max-w-3xl text-sm text-secondary-foreground">
          Elige un mazo para ver todas sus tarjetas y studiedo. Cada sesión empieza por las
          tarjetas que menos has estudiado y el orden cambia en cada intento, así que puedes
          repetir el mazo cuantas veces quieras.
        </p>
      </header>

      <ResumeCard overview={overview} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs font-medium text-secondary-foreground">Tarjetas</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatNumber(allDecks.totalCards)}</p>
          <p className="mt-1 text-xs text-secondary-foreground">En todos tus mazos</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs font-medium text-secondary-foreground">Nuevas</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{formatNumber(allDecks.new)}</p>
          <p className="mt-1 text-xs text-secondary-foreground">Sin estudiar todavía</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs font-medium text-secondary-foreground">Mazos</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatNumber(overview.decks.length)}</p>
          <p className="mt-1 text-xs text-secondary-foreground">Disponibles para estudiar</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs font-medium text-secondary-foreground">Aprendidas</p>
          <p className="mt-1 text-2xl font-bold text-primary">
            {formatNumber(allDecks.learning + allDecks.review)}
          </p>
          <p className="mt-1 text-xs text-secondary-foreground">En aprendizaje o con intervalo</p>
        </div>
      </section>

      <StudyDeckPicker decks={overview.decks} />

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