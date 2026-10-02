"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StudyCardFace, { StudyCardAudio } from "@/components/study/StudyCardFace";
import StudyCounters from "@/components/study/StudyCounters";
import StudyRatingBar from "@/components/study/StudyRatingBar";
import {
  completeStudySessionAction,
  pauseStudySessionAction,
  resumeStudySessionAction,
  reviewStudyCardAction,
} from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { getRatingFromShortcut } from "@/constants/srs";
import { STUDY_TIMER_INTERVAL_MS } from "@/constants/study";
import type { SrsRating } from "@/constants/srs";
import type { StudyCountBucket } from "@/constants/study";
import type {
  StudyCardView,
  StudyQueueCounts,
  StudyQueueItemView,
  StudySessionState,
} from "@/types/study";

interface QueueEntry {
  cardId: string;
  bucket: StudyCountBucket;
  /** Momento (epoch ms) en el que la tarjeta vuelve a estar disponible. */
  dueAt: number;
}

interface AnsweredCard {
  cardId: string;
  rating: SrsRating;
  intervalLabel: string;
}

interface StudySessionPageProps {
  initialState: StudySessionState;
}

const REVEAL_KEYS = [" ", "spacebar", "enter"];

/** Cubo del contador al que pasa una tarjeta según el estado en que la deja el planificador. */
function bucketOf(status: string): StudyCountBucket {
  if (status === "new") {
    return "new";
  }

  return status === "review" ? "review" : "learning";
}

function toQueueEntries(queue: StudyQueueItemView[]): QueueEntry[] {
  return queue.map((item) => ({ cardId: item.cardId, bucket: item.bucket, dueAt: 0 }));
}

interface SessionActionProps {
  onClick: () => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Botón de la barra superior del modo estudio. */
function SessionAction({ onClick, label, hint, disabled = false }: SessionActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint ?? label}
      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
    >
      {label}
    </button>
  );
}

interface PauseOverlayProps {
  isPaused: boolean;
  isBusy: boolean;
  onResume: () => void;
  onFinish: () => void;
}

/** Capa de pausa: la sesión queda congelada y se ofrece reanudar o cerrar (RF-019). */
function PauseOverlay({ isPaused, isBusy, onResume, onFinish }: PauseOverlayProps) {
  if (!isPaused) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background p-6 text-center shadow-xl">
        <h2 className="text-xl font-bold text-primary">Sesión en pausa</h2>
        <p className="text-sm text-secondary-foreground">
          El tiempo está detenido y la tarjeta actual se conserva. También puedes volver a esta sesión más
          tarde desde el panel de estudio.
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            disabled={isBusy}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Reanudar
          </button>
          <button
            type="button"
            onClick={onFinish}
            disabled={isBusy}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Terminar y ver el resumen
          </button>
          <Link
            href="/study"
            className="rounded-lg px-5 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary"
          >
            Salir al panel de estudio
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Interfaz de estudio (spec 05). Toda la interacción ocurre en el cliente: la cola
 * se construye en el servidor al empezar la sesión y aquí solo se revela, se califica
 * y se navega.
 *
 * - RF-006: el anverso va centrado y sin distracciones.
 * - RF-007: clic o barra espaciadora revelan el reverso.
 * - RF-008 / RF-009 / RF-010: cuatro botones con el intervalo y atajos 1-4.
 * - RF-011: las flechas recorren las tarjetas ya respondidas.
 * - RF-012 / RF-013 / RF-014: contadores y tiempo en vivo.
 * - RF-019 / RF-020: pausa y reanudación con la tarjeta conservada.
 * - RF-022 / RF-023: el modo cram no programa nada.
 */
export default function StudySessionPage({ initialState }: StudySessionPageProps) {
  const router = useRouter();

  const [session, setSession] = useState(initialState.session);
  const [cards, setCards] = useState<Map<string, StudyCardView>>(
    () => new Map(initialState.cards.map((card) => [card.id, card]))
  );
  const [queue, setQueue] = useState<QueueEntry[]>(() => toQueueEntries(initialState.queue));
  const [counts, setCounts] = useState<StudyQueueCounts>(initialState.session.counts);
  const [revealed, setRevealed] = useState(false);
  const [isPaused, setIsPaused] = useState(initialState.session.status === "paused");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<AnsweredCard[]>([]);
  /** Índice dentro de `answered` de la tarjeta que se está revisando, o `null`. */
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Reloj en vivo de la sesión: se reinicia con cada respuesta para no contar la ida y vuelta. */
  const [clockBase, setClockBase] = useState<number>(() => Date.now());
  /** Momento en el que se califica la tarjeta actual. */
  const [shownAt, setShownAt] = useState<number>(() => Date.now());
  /** Reloj de referencia, actualizado una vez por segundo. */
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Reloj de un segundo: mueve el temporizador (RF-014) y hace aparecer las
  // tarjetas de aprendizaje cuando vence su retardo.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), STUDY_TIMER_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement !== null);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Al volver a la pestaña se reinicia el reloj: el tiempo en otra pestaña no
  // cuenta como tiempo de estudio.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        setNowMs(Date.now());
        setClockBase(Date.now());
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const elapsedMs =
    session.elapsedMs + (isPaused ? 0 : Math.max(0, nowMs - clockBase));

  /**
   * Primera tarjeta lista de la cola: el aprendizaje tiene prioridad sobre el
   * resto. Como `nowMs` cambia cada segundo, una tarjeta de aprendizaje aparece en
   * cuanto vence su retardo.
   */
  const activeEntry = queue.find((entry) => entry.dueAt <= nowMs) ?? null;

  const activeCard = activeEntry ? (cards.get(activeEntry.cardId) ?? null) : null;
  const isBrowsing = reviewIndex !== null;
  const browsedCard = isBrowsing ? (cards.get(answered[reviewIndex as number]?.cardId ?? "") ?? null) : null;
  const isFinished = queue.length === 0;
  const isWaiting = activeCard === null && queue.length > 0;
  const waitingSeconds =
    isWaiting && queue.length > 0
      ? Math.max(0, Math.ceil((Math.min(...queue.map((entry) => entry.dueAt)) - nowMs) / 1000))
      : 0;

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  function handleReveal() {
    if (isPaused || isSubmitting || isBrowsing || !activeCard || revealed) {
      return;
    }

    setRevealed(true);
  }

  async function handleRate(rating: SrsRating) {
    if (isPaused || isSubmitting || !activeEntry || !activeCard || !revealed) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const cardId = activeEntry.cardId;
    const timeSpentMs = Math.max(0, Date.now() - shownAt);

    try {
      const result = await reviewStudyCardAction({
        sessionId: session.id,
        cardId,
        rating,
        timeSpentMs,
      });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo guardar la calificación"));
        return;
      }

      if (isSuccess(result)) {
        const review = result[0];
        const comesBackLater = review.nextDueAt !== null;
        const nextBucket = bucketOf(review.status);

        // RF-013: el contador del servidor llega ya actualizado. Si la tarjeta
        // vuelve a salir dentro del día se reincorpora a la cola y hay que
        // sumarla al cubo que le corresponde, porque para el servidor ya está
        // calificada.
        setCounts(
          comesBackLater
            ? { ...review.counts, [nextBucket]: review.counts[nextBucket] + 1 }
            : review.counts
        );
        setSession((current) => ({
          ...current,
          elapsedMs: review.elapsedMs,
          totalCards: current.totalCards + 1,
        }));
        setClockBase(Date.now());
        setShownAt(Date.now());

        setAnswered((current) => [...current, { cardId, rating, intervalLabel: review.intervalLabel }]);

        setQueue((current) => {
          const rest = current.filter((entry) => entry.cardId !== cardId);

          if (review.nextDueAt) {
            return [
              { cardId, bucket: nextBucket, dueAt: new Date(review.nextDueAt).getTime() },
              ...rest,
            ];
          }

          return rest;
        });

        setRevealed(false);

        // La sesión solo termina cuando no queda nada en la cola local: una tarjeta
        // de aprendizaje que reaparece más tarde sigue formando parte de ella.
        if (review.isFinished && !comesBackLater) {
          router.push(`/study/summary/${session.id}`);
        }
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePause() {
    if (isPaused || isBusy) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const result = await pauseStudySessionAction({
        sessionId: session.id,
        cardId: activeEntry?.cardId,
      });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo pausar la sesión"));
        return;
      }

      if (isSuccess(result)) {
        // El tiempo se congela con el valor que devuelve el servidor.
        setSession(result[0].session);
        setCounts(result[0].session.counts);
        setClockBase(Date.now());
        setIsPaused(true);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleResume() {
    setIsBusy(true);
    setError(null);

    try {
      const result = await resumeStudySessionAction({ sessionId: session.id });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo reanudar la sesión"));
        return;
      }

      if (isSuccess(result)) {
        const state = result[0];

        setSession(state.session);
        setCounts(state.session.counts);
        setCards(new Map(state.cards.map((card) => [card.id, card])));
        setQueue(toQueueEntries(state.queue));
        setClockBase(Date.now());
        setShownAt(Date.now());
        setRevealed(false);
        setIsPaused(false);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleFinish() {
    setIsBusy(true);
    setError(null);

    try {
      const result = await completeStudySessionAction({ sessionId: session.id });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo cerrar la sesión"));
        return;
      }

      if (isSuccess(result)) {
        router.push(`/study/summary/${session.id}`);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsBusy(false);
    }
  }

  // RF-011: las flechas recorren, en solo lectura, las tarjetas ya respondidas.
  const handlePrevious = useCallback(() => {
    setReviewIndex((current) => {
      if (current === null) {
        return answered.length > 0 ? answered.length - 1 : null;
      }

      return current > 0 ? current - 1 : current;
    });
  }, [answered.length]);

  const handleNext = useCallback(() => {
    setReviewIndex((current) => {
      if (current === null || current >= answered.length - 1) {
        return null;
      }

      return current + 1;
    });
  }, [answered.length]);

  // El manejador de teclado se registra una sola vez: los closures leen el estado
  // más reciente a través de refs en lugar de depender de él.
  const latestRef = useRef({ revealed, isPaused, isFinished, isBrowsing, answeredCount: answered.length });
  const handlersRef = useRef({ handleReveal, handleRate, handlePause, handlePrevious, handleNext });

  useEffect(() => {
    latestRef.current = { revealed, isPaused, isFinished, isBrowsing, answeredCount: answered.length };
    handlersRef.current = { handleReveal, handleRate, handlePause, handlePrevious, handleNext };
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;

      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const state = latestRef.current;
      const handlers = handlersRef.current;

      if (key === "escape") {
        event.preventDefault();

        if (!state.isPaused && !state.isFinished) {
          void handlers.handlePause();
        }

        return;
      }

      if (key === "arrowleft") {
        event.preventDefault();
        handlers.handlePrevious();
        return;
      }

      if (key === "arrowright") {
        event.preventDefault();
        handlers.handleNext();
        return;
      }

      if (state.isPaused || state.isFinished) {
        return;
      }

      // Mientras se revisa una tarjeta ya respondida no se califica nada: las
      // flechas llevan a un modo de solo lectura.
      if (state.isBrowsing) {
        return;
      }

      if (!state.revealed) {
        if (REVEAL_KEYS.includes(key)) {
          event.preventDefault();
          handlers.handleReveal();
        }

        return;
      }

      const rating = getRatingFromShortcut(key);

      if (rating) {
        event.preventDefault();
        void handlers.handleRate(rating);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SessionAction onClick={() => router.push("/study")} label="← Panel" />
          <span className="text-sm font-medium text-primary">
            {session.isCramMode
              ? "Modo repaso (sin scheduling)"
              : (session.deckName ?? "Todos los mazos")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <SessionAction
            onClick={toggleFullscreen}
            label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          />
          <SessionAction
            onClick={() => void handlePause()}
            label="Pausar"
            hint="Pausar (Esc)"
            disabled={isFinished || isPaused}
          />
        </div>
      </header>

      <StudyCounters counts={counts} elapsedMs={elapsedMs} answered={answered.length} />

      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {isFinished ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-background p-8 text-center">
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-primary">Sesión completada</h2>
            <p className="text-sm text-secondary-foreground">
              Ya no quedan tarjetas en esta sesión. Te llevamos al resumen.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/study/summary/${session.id}`)}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Ver resumen
            </button>
          </div>
        </div>
      ) : isWaiting ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-border bg-background p-8 text-center">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-primary">Siguiente tarjeta en un momento</h2>
            <p className="text-sm text-secondary-foreground">
              Quedan {queue.length} tarjeta(s) esperando su paso de aprendizaje. Vuelve en{" "}
              <strong className="font-mono text-primary">{waitingSeconds} s</strong>.
            </p>
            <button
              type="button"
              onClick={() => void handleFinish()}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-secondary"
            >
              Terminar la sesión
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={handleReveal}
            disabled={revealed || isSubmitting}
            className="min-h-[16rem] w-full rounded-xl border border-border bg-background p-6 text-left transition-colors hover:bg-secondary/50 disabled:cursor-default disabled:hover:bg-background sm:min-h-[20rem]"
            aria-label={revealed ? "Reverso mostrado" : "Mostrar el reverso"}
          >
            {activeCard && <StudyCardFace card={activeCard} revealed={revealed} />}
          </button>

          {activeCard && <StudyCardAudio card={activeCard} />}

          {revealed && activeCard ? (
            <StudyRatingBar
              card={activeCard}
              settings={initialState.srsSettings}
              isCramMode={session.isCramMode}
              disabled={isSubmitting}
              onRate={(rating) => void handleRate(rating)}
            />
          ) : (
            <p className="text-center text-sm text-secondary-foreground">
              Pulsa <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">espacio</kbd>{" "}
              o haz clic en la tarjeta para ver el reverso.
            </p>
          )}

          {browsedCard && (
            <div className="rounded-xl border border-border bg-secondary/40 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-secondary-foreground">
                Revisando ({answered[reviewIndex as number]?.rating}) · pulsa la flecha derecha para volver
              </p>
              <StudyCardFace card={browsedCard} revealed />
            </div>
          )}
        </>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary-foreground">
        <span>
          Atajos: <kbd className="font-mono">espacio</kbd> revelar ·{" "}
          <kbd className="font-mono">1</kbd>–<kbd className="font-mono">4</kbd> calificar ·{" "}
          <kbd className="font-mono">←</kbd>/<kbd className="font-mono">→</kbd> recorrer ·{" "}
          <kbd className="font-mono">Esc</kbd> pausar
        </span>
        {session.earlyDays > 0 && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
            Estudio anticipado: {session.earlyDays} día(s)
          </span>
        )}
      </footer>

      <PauseOverlay
        isPaused={isPaused}
        isBusy={isBusy}
        onResume={() => void handleResume()}
        onFinish={() => void handleFinish()}
      />
    </div>
  );
}