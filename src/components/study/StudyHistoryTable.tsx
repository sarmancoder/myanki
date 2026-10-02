"use client";

import Link from "next/link";
import { formatDateTime, formatDurationText, formatNumber, formatPercent } from "@/lib/format";
import { SRS_RATING_OPTIONS } from "@/constants/srs";
import { STUDY_RATING_COUNTER_FIELD } from "@/constants/study";
import type { StudyHistoryResult } from "@/types/study";

interface HistoryTableProps {
  result: StudyHistoryResult;
}

/** Historial de sesiones finalizadas: total, duración, desglose y precisión. */
export default function StudyHistoryTable({ result }: HistoryTableProps) {
  if (result.sessions.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-background px-4 py-8 text-center text-sm text-secondary-foreground">
        Todavía no has terminado ninguna sesión de estudio.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-background">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-secondary-foreground">
            <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
            <th scope="col" className="px-4 py-3 font-medium">Mazo</th>
            <th scope="col" className="px-4 py-3 font-medium">Tarjetas</th>
            <th scope="col" className="px-4 py-3 font-medium">Desglose</th>
            <th scope="col" className="px-4 py-3 font-medium">Tiempo</th>
            <th scope="col" className="px-4 py-3 font-medium">Precisión</th>
            <th scope="col" className="px-4 py-3 font-medium">Resumen</th>
          </tr>
        </thead>
        <tbody>
          {result.sessions.map((session) => (
            <tr key={session.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 text-secondary-foreground">
                {formatDateTime(session.startedAt)}
              </td>
              <td className="px-4 py-3 text-primary">
                {session.deckName ?? "Todos los mazos"}
                {session.isCramMode && (
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
                    repaso
                  </span>
                )}
              </td>
              <td className="px-4 py-3 font-medium text-primary">{formatNumber(session.totalCards)}</td>
              <td className="px-4 py-3 text-xs text-secondary-foreground">
                {SRS_RATING_OPTIONS.map((option) => (
                  <span key={option.value} className="mr-2 whitespace-nowrap">
                    {option.label}:{" "}
                    <strong className="font-semibold text-primary">
                      {session[STUDY_RATING_COUNTER_FIELD[option.value]]}
                    </strong>
                  </span>
                ))}
              </td>
              <td className="px-4 py-3 text-secondary-foreground">
                {formatDurationText(session.durationMs)}
              </td>
              <td className="px-4 py-3 font-medium text-primary">{formatPercent(session.accuracy)}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/study/summary/${session.id}`}
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Ver
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface HistoryPaginationProps {
  result: StudyHistoryResult;
}

function HistoryPagination({ result }: HistoryPaginationProps) {
  if (result.totalPages <= 1) {
    return null;
  }

  const buildHref = (page: number) => {
    const params = new URLSearchParams({ page: String(page) });

    return `/study/history?${params.toString()}`;
  };

  return (
    <nav className="flex items-center justify-between text-sm" aria-label="Paginación del historial">
      {result.page > 1 ? (
        <Link href={buildHref(result.page - 1)} className="text-primary underline-offset-2 hover:underline">
          ← Anteriores
        </Link>
      ) : (
        <span />
      )}

      <span className="text-secondary-foreground">
        Página {result.page} de {result.totalPages}
      </span>

      {result.page < result.totalPages ? (
        <Link href={buildHref(result.page + 1)} className="text-primary underline-offset-2 hover:underline">
          Siguientes →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export { HistoryPagination };