"use client";

import Link from "next/link";
import { formatNumber, formatPercent } from "@/lib/format";
import type { StudyDailyStatsResult } from "@/types/study";

interface HomePageProps {
  name: string;
  totals: {
    decks: number;
    cards: number;
    dueToday: number;
    newCards: number;
  };
  today: Pick<StudyDailyStatsResult["totals"], "totalCards" | "newCards" | "reviewCards"> & {
    accuracy: number;
    streak: number;
  };
}

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  accent: boolean;
}

function StatCard({ label, value, hint, accent }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-blue-600" : "text-primary"}`}>{value}</p>
      <p className="mt-1 text-xs text-secondary-foreground">{hint}</p>
    </div>
  );
}

export default function HomePage({ name, totals, today }: HomePageProps) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Mazos" value={formatNumber(totals.decks)} hint="Totales en tu biblioteca" accent={false} />
        <StatCard label="Tarjetas" value={formatNumber(totals.cards)} hint="En todos tus mazos" accent={false} />
        <StatCard label="Nuevas" value={formatNumber(totals.newCards)} hint="Sin estudiar todavía" accent={false} />
        <StatCard label="Pendientes hoy" value={formatNumber(totals.dueToday)} hint="Repasos programados" accent={totals.dueToday > 0} />
      </section>

      <section className="rounded-lg border border-border bg-background p-6">
        <h2 className="text-lg font-semibold text-primary">
          {name ? `¿Qué hacemos ahora, ${name}?` : "¿Qué hacemos ahora?"}
        </h2>
        <p className="mt-2 text-sm text-secondary-foreground">
          {today.totalCards > 0 ? (
            <>
              Hoy ya has estudiado{" "}
              <strong className="font-semibold text-primary">{formatNumber(today.totalCards)}</strong> tarjeta(s)
              con una precisión del <strong className="font-semibold text-primary">{formatPercent(today.accuracy)}</strong>
              {today.streak > 1 && (
                <>
                  {" "}
                  y llevas <strong className="font-semibold text-primary">{formatNumber(today.streak)}</strong>{" "}
                  días seguidos
                </>
              )}
              .
            </>
          ) : (
            "Aún no has estudiado hoy. Elige un mazo y empieza a repasar."
          )}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/study"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Estudiar ahora
          </Link>
          <Link
            href="/decks"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Ver mis mazos
          </Link>
          <Link
            href="/decks/new"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Crear un mazo
          </Link>
          <Link
            href="/study/history"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Historial de estudio
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Configuración
          </Link>
        </div>
      </section>
    </div>
  );
}