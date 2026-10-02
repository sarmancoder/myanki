import Link from "next/link";
import StudyHistoryTable, { HistoryPagination } from "@/components/study/StudyHistoryTable";
import { formatDurationText, formatNumber, formatPercent } from "@/lib/format";
import { STUDY_DAILY_STATS_DAYS } from "@/constants/study";
import type { StudyDailyStatsResult, StudyHistoryResult } from "@/types/study";

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

interface DayBar {
  day: StudyDailyStatsResult["days"][number];
  /** Porcentaje respecto al día con más tarjetas del periodo. */
  height: number;
}

/** Barra compacta de los últimos días de estudio. */
function DailyBars({ stats }: { stats: StudyDailyStatsResult }) {
  if (stats.days.length === 0) {
    return (
      <p className="text-sm text-secondary-foreground">
        Todavía no hay tarjetas por día registradas. Empieza una sesión para ver la racha.
      </p>
    );
  }

  const max = Math.max(...stats.days.map((day) => day.totalCards), 1);
  const bars: DayBar[] = stats.days.map((day) => ({
    day,
    height: Math.max(6, Math.round((day.totalCards / max) * 100)),
  }));

  return (
    <div className="space-y-3">
      <div className="flex h-28 items-end gap-1" role="img" aria-label="Tarjetas por día">
        {bars.map(({ day, height }) => (
          <div
            key={day.studyDate}
            title={`${day.studyDate}: ${formatNumber(day.totalCards)} tarjetas`}
            className="flex-1 rounded-t bg-primary/70"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-secondary-foreground">
        <span>{bars[0]?.day.studyDate}</span>
        <span>Racha actual: {formatNumber(stats.currentStreak)} día(s)</span>
        <span>{bars[bars.length - 1]?.day.studyDate}</span>
      </div>
    </div>
  );
}

interface StudyHistoryPageProps {
  result: StudyHistoryResult;
  stats: StudyDailyStatsResult;
}

/** `/study/history`: sesiones finalizadas y tarjetas por día. */
export default function StudyHistoryPage({ result, stats }: StudyHistoryPageProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">Historial de estudio</h1>
        <p className="max-w-3xl text-sm text-secondary-foreground">
          Sesiones finalizadas y tarjetas respondidas en los últimos {STUDY_DAILY_STATS_DAYS} días.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sesiones"
          value={formatNumber(result.totalSessions)}
          hint="Finalizadas en total"
        />
        <StatCard
          label="Tarjetas"
          value={formatNumber(result.totals.totalCards)}
          hint="En todas las sesiones"
          accent
        />
        <StatCard
          label="Tiempo"
          value={formatDurationText(result.totals.durationMs)}
          hint="Tiempo de respuesta acumulado"
        />
        <StatCard
          label="Precisión"
          value={formatPercent(result.totals.accuracy)}
          hint="Buenos y fáciles sobre el total"
        />
      </section>

      <section className="rounded-lg border border-border bg-background p-5">
        <h2 className="mb-4 text-sm font-semibold text-primary">Tarjetas por día</h2>
        <DailyBars stats={stats} />
      </section>

      <StudyHistoryTable result={result} />

      <HistoryPagination result={result} />

      <Link
        href="/study"
        className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        ← Volver al panel de estudio
      </Link>
    </div>
  );
}