import { notFound } from "next/navigation";
import { serverClient } from "@/server/client";
import StudySummaryPage from "./StudySummaryPage";

interface StudySummaryPageDataProps {
  sessionId: string;
}

/**
 * Resumen de la sesión (RF-015): totales, desglose de calificaciones y precisión.
 *
 * Si la sesión seguía abierta se cierra al entrar aquí, de modo que abandonar el
 * estudio a mitad de camino no deje una sesión bloqueada en "Reanudar".
 */
export default async function StudySummaryPageData({ sessionId }: StudySummaryPageDataProps) {
  const summary = await serverClient.study.summary({ sessionId }).catch(() => null);

  if (!summary) {
    notFound();
  }

  if (!summary.session.isCompleted) {
    await serverClient.study.complete({ sessionId });
  }

  return <StudySummaryPage summary={summary} />;
}