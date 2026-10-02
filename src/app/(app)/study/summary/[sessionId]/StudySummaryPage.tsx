"use client";

import Link from "next/link";
import { SRS_YES_NO_OPTIONS } from "@/constants/srs";
import { formatDateTime, formatDurationText, formatNumber, formatPercent } from "@/lib/format";
import type { StudySummary } from "@/types/study";

interface MetricProps {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}

function Metric({ label, value, hint, accent = false }: MetricProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-blue-600" : "text-primary"}`}>{value}</p>
      <p className="mt-1 text-xs text-secondary-foreground">{hint}</p>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  hint: string;
  className: string;
}

/** Una fila del desglose de respuestas, reutilizando los colores de la barra. */
function SummaryRow({ label, value, hint, className }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
      <span className="flex items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${className}`}>{label}</span>
        <span className="text-xs text-secondary-foreground">{hint}</span>
      </span>
      <span className="text-sm font-medium text-primary">{value}</span>
    </div>
  );
}

interface StudySummaryPageProps {
  summary: StudySummary;
}

/**
 * Resumen de la sesión al terminarla (RF-015): total, tiempo, desglose de
 * respuestas y precisión, con dos salidas: otra sesión o el panel (RF-016).
 *
 * El desglose se agrupa en las dos respuestas que el usuario puede dar, "Sí" y
 * "No". Las respuestas "Sí" suman `good` y `easy` y las "No", `again` y `hard`.
 */
export default function StudySummaryPage({ summary }: StudySummaryPageProps) {
  const { session, breakdown, accuracy, durationMs, averageMsPerCard } = summary;
  const answers = breakdown.reduce((total, item) => total + item.count, 0);
  const countFor = (...ratings: string[]) =>
    breakdown
      .filter((item) => ratings.includes(item.rating))
      .reduce((total, item) => total + item.count, 0);

  const rows = [
    {
      option: SRS_YES_NO_OPTIONS[0],
      count: countFor("good", "easy"),
      hint: "Recordada",
    },
    {
      option: SRS_YES_NO_OPTIONS[1],
      count: countFor("again", "hard"),
      hint: "Olvidada",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          {answers > 0 ? "Sesión completada" : "Sesión finalizada"}
        </h1>
        <p className="text-sm text-secondary-foreground">
          {session.deckName ?? "Todos los mazos"}
          {session.isCramMode ? " · modo repaso (no afecta al scheduling)" : ""} · empezaste el{" "}
          {formatDateTime(session.startedAt)}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Tarjetas estudiadas"
          value={formatNumber(session.totalCards)}
          hint={session.isCramMode ? "Respuestas en modo repaso" : "Respuestas dadas"}
          accent
        />
        <Metric
          label="Tiempo total"
          value={formatDurationText(durationMs)}
          hint={
            averageMsPerCard > 0
              ? `${formatDurationText(averageMsPerCard)} por tarjeta`
              : "Sin tiempo por tarjeta"
          }
        />
        <Metric
          label="Precisión"
          value={formatPercent(accuracy)}
          hint="Recordadas sobre el total"
        />
        <Metric
          label="Tarjetas pendientes"
          value={formatNumber(session.counts.remaining)}
          hint="Quedaron sin responder"
        />
      </section>

      <section className="rounded-lg border border-border bg-background p-6">
        <h2 className="text-sm font-semibold text-primary">Desglose de respuestas</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {rows.map(({ option, count, hint }) => (
            <SummaryRow
              key={option.value}
              label={option.label}
              value={formatNumber(count)}
              hint={hint}
              className={option.buttonClassName}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link
          href={session.deckSlug ? `/study/deck/${session.deckSlug}` : "/study"}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Empezar otra sesión
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
        >
          Volver al panel
        </Link>
        <Link
          href="/study/history"
          className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
        >
          Ver historial
        </Link>
      </section>
    </div>
  );
}