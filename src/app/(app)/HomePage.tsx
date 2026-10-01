"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/format";

interface HomePageProps {
  name: string;
  totals: {
    decks: number;
    cards: number;
    dueToday: number;
    newCards: number;
  };
}

interface StatCardProps {
  label: string;
  value: number;
  hint: string;
  accent: boolean;
}

function StatCard({ label, value, hint, accent }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-blue-600" : "text-primary"}`}>
        {formatNumber(value)}
      </p>
      <p className="mt-1 text-xs text-secondary-foreground">{hint}</p>
    </div>
  );
}

export default function HomePage({ name, totals }: HomePageProps) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Mazos" value={totals.decks} hint="Totales en tu biblioteca" accent={false} />
        <StatCard label="Tarjetas" value={totals.cards} hint="En todos tus mazos" accent={false} />
        <StatCard label="Nuevas" value={totals.newCards} hint="Sin estudiar todavía" accent={false} />
        <StatCard label="Pendientes hoy" value={totals.dueToday} hint="Repasos programados" accent={totals.dueToday > 0} />
      </section>

      <section className="rounded-lg border border-border bg-background p-6">
        <h2 className="text-lg font-semibold text-primary">
          {name ? `¿Qué hacemos ahora, ${name}?` : "¿Qué hacemos ahora?"}
        </h2>
        <p className="mt-2 text-sm text-secondary-foreground">
          El módulo de estudio se habilitará cuando completes la gestión de mazos y tarjetas.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/decks"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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