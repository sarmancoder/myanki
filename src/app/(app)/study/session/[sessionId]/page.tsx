import { Suspense } from "react";
import StudySessionPageData from "./StudySessionPageData";

interface StudySessionRouteProps {
  params: Promise<{ sessionId: string }>;
}

export default async function StudySessionRoute({ params }: StudySessionRouteProps) {
  const { sessionId } = await params;

  return (
    <Suspense fallback={<StudySessionFallback />}>
      <StudySessionPageData sessionId={sessionId} />
    </Suspense>
  );
}

/** Esqueleto de carga de la interfaz de tarjetas. */
function StudySessionFallback() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-10 w-full animate-pulse rounded-lg border border-border bg-secondary/60" />
      <div className="h-72 w-full animate-pulse rounded-xl border border-border bg-secondary/60" />
      <span className="sr-only">Cargando la sesión de estudio...</span>
    </div>
  );
}