"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StudyCardFace from "@/components/study/StudyCardFace";
import StudyCardAudio from "@/components/study/StudyCardAudio";
import StudyCounters from "@/components/study/StudyCounters";
import StudyYesNoBar from "@/components/study/StudyYesNoBar";
import {
  completeStudySessionAction,
  pauseStudySessionAction,
  resumeStudySessionAction,
  reviewStudyCardsBatchAction,
} from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { getYesNoRatingFromShortcut } from "@/constants/srs";
import { STUDY_RATING_COUNTER_FIELD, STUDY_TIMER_INTERVAL_MS } from "@/constants/study";
import { applyLocalReview } from "@/lib/study/local-review";
import { countBuckets } from "@/lib/study/queue";
import { audioPreferenceStore } from "@/lib/study/audio-preference";
import {
  clearPendingAnswers,
  readPendingAnswers,
  writePendingAnswers,
} from "@/lib/study/pending-answers";
import type { SrsRating } from "@/constants/srs";
import type { StudyCountBucket } from "@/constants/study";
import type {
  StudyAnswerDraft,
  StudyCardView,
  StudyQueueItemView,
  StudySessionState,
} from "@/types/study";

interface QueueEntry {
  cardId: string;
  bucket: StudyCountBucket;
  /** Momento (epoch ms) en el que la tarjeta vuelve a estar disponible. */
  dueAt: number;
}

/** Respuesta calificada en el cliente y pendiente de enviarse al servidor. */
interface SessionAnswer extends StudyAnswerDraft {
  intervalLabel: string;
}

interface StudySessionPageProps {
  initialState: StudySessionState;
}

const REVEAL_KEYS = [" ", "spacebar", "enter"];

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
 * Interfaz de estudio (spec 05). Toda la interacción ocurre en el cliente.
 *
 * El planificador también: calificar no hace ninguna ida al servidor. El SRS se
 * resuelve en el navegador con el mismo algoritmo que usa el servidor y la
 * respuesta se guarda en memoria, así que la tarjeta siguiente aparece en el mismo
 * instante en que se pulsa. Al agotarse la cola —o al pausar o cerrar— todas las
 * respuestas viajan en un único lote. Cada una lleva una clave estable, de modo que
 * reenviar el lote tras un fallo no las cuenta dos veces, y además quedan en
 * `localStorage` para no perderlas si se cierra la pestaña a media sesión.
 *
 * - RF-006: el anverso va centrado y sin distracciones.
 * - RF-007: clic o barra espaciadora revelan el reverso.
 * - RF-025: dos botones, "Sí" y "No", con el intervalo previsto y atajos S/1 y N/2.
 * - RF-011: las flechas recorren las tarjetas ya respondidas.
 * - RF-012 / RF-013 / RF-014: contadores y tiempo en vivo.
 * - RF-019 / RF-020: pausa y reanudación con la tarjeta conservada.
 * - RF-022 / RF-023: el modo cram no programa nada.
 */
export default function StudySessionPage({ initialState }: StudySessionPageProps) {
  const router = useRouter();
  const sessionId = initialState.session.id;

  const [session, setSession] = useState(initialState.session);
  const [cards, setCards] = useState<Map<string, StudyCardView>>(
    () => new Map(initialState.cards.map((card) => [card.id, card]))
  );
  const [queue, setQueue] = useState<QueueEntry[]>(() => toQueueEntries(initialState.queue));
  const [revealed, setRevealed] = useState(false);
  const [isPaused, setIsPaused] = useState(initialState.session.status === "paused");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Respuestas calificadas en el cliente, las guardadas y las que no. */
  const [answers, setAnswers] = useState<SessionAnswer[]>([]);
  /** Índice dentro de `answers` de la tarjeta que se está revisando, o `null`. */
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  /** Reloj en vivo de la sesión: se reinicia con cada respuesta para no contar la ida y vuelta. */
  const [clockBase, setClockBase] = useState<number>(() => Date.now());
  /** Momento en el que se califica la tarjeta actual. */
  const [shownAt, setShownAt] = useState<number>(() => Date.now());
  /** Reloj de referencia, actualizado una vez por segundo. */
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Refs espejo del estado. Los manejadores de teclado y el envío del lote se
  // registran una sola vez y leen siempre el valor más reciente sin depender de él.
  const answersRef = useRef<SessionAnswer[]>([]);
  const cardsRef = useRef(cards);
  const queueRef = useRef(queue);
  /** Envío del lote en curso, para no lanzar dos a la vez. */
  const syncingRef = useRef<Promise<boolean> | null>(null);
  /** Claves de las respuestas que el servidor ya tiene guardadas. */
  const syncedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  // Preferencia de sonido guardada. Se lee como almacén externo para que el primer
  // render del servidor y el del cliente coincidan.
  const isAudioEnabled = useSyncExternalStore(
    audioPreferenceStore.subscribe,
    audioPreferenceStore.getSnapshot,
    audioPreferenceStore.getServerSnapshot
  );

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

  const elapsedMs = session.elapsedMs + (isPaused ? 0 : Math.max(0, nowMs - clockBase));

  /**
   * Primera tarjeta lista de la cola: el aprendizaje tiene prioridad sobre el
   * resto. Como `nowMs` cambia cada segundo, una tarjeta de aprendizaje aparece en
   * cuanto vence su retardo.
   */
  const activeEntry = queue.find((entry) => entry.dueAt <= nowMs) ?? null;

  const activeCard = activeEntry ? (cards.get(activeEntry.cardId) ?? null) : null;
  const isBrowsing = reviewIndex !== null;
  const browsedCard = isBrowsing ? (cards.get(answers[reviewIndex as number]?.cardId ?? "") ?? null) : null;
  const isFinished = queue.length === 0;
  const isWaiting = activeCard === null && queue.length > 0;
  const waitingSeconds =
    isWaiting && queue.length > 0
      ? Math.max(0, Math.ceil((Math.min(...queue.map((entry) => entry.dueAt)) - nowMs) / 1000))
      : 0;
  const unsyncedCount = answers.length - syncedKeysRef.current.size;

  // Los contadores salen de la cola local: como contiene exactamente las tarjetas
  // sin calificar, el resultado es el mismo que antes devolvía el servidor en cada
  // respuesta, sin su ida y vuelta. `bucketForStatus` es idempotente, así que
  // contar los cubos de la cola equivale a contar sus estados.
  const counts = useMemo(() => countBuckets(queue.map((entry) => entry.bucket)), [queue]);

  /** Respuestas que el servidor todavía no tiene guardadas. */
  const pendingAnswers = useCallback(
    (): StudyAnswerDraft[] => answersRef.current.filter((answer) => !syncedKeysRef.current.has(answer.key)),
    []
  );

  /** Deja en `localStorage` lo que queda sin enviar, como red de seguridad. */
  const persistPending = useCallback(() => {
    writePendingAnswers(sessionId, pendingAnswers());
  }, [sessionId, pendingAnswers]);

  /**
   * Envía al servidor las respuestas que aún no ha guardado.
   *
   * Solo viaja la cola pendiente porque el resto ya está en la base de datos. Si ya
   * hay un envío en marcha se espera a ese en lugar de saltárselo: pausar o cerrar la
   * sesión necesitan que las respuestas estén guardadas sí o sí.
   *
   * Devuelve `true` cuando no queda nada por enviar, tanto si no había nada como si
   * el guardado se completó.
   */
  const syncAnswers = useCallback((): Promise<boolean> => {
    if (syncingRef.current) {
      return syncingRef.current;
    }

    const pending = pendingAnswers();

    if (pending.length === 0) {
      return Promise.resolve(true);
    }

    setIsSyncing(true);
    setError(null);

    const inFlight = (async () => {
      try {
        const result = await reviewStudyCardsBatchAction({ sessionId, answers: pending });

        if (isError(result)) {
          setError(getErrorMessage(result[1].message, "No se pudieron guardar las respuestas"));

          return false;
        }

        for (const key of result[0].savedKeys) {
          syncedKeysRef.current.add(key);
        }

        // Una tarjeta borrada a mitad de sesión ya no está en la cola del servidor
        // y su respuesta no se puede guardar: se marca como resuelta para no
        // reintentarla eternamente.
        for (const answer of pending) {
          if (!cardsRef.current.has(answer.cardId)) {
            syncedKeysRef.current.add(answer.key);
          }
        }

        persistPending();

        return pendingAnswers().length === 0;
      } catch {
        setError("Error de conexión. Las respuestas se guardarán al volver a abrir la sesión.");

        return false;
      } finally {
        syncingRef.current = null;
        setIsSyncing(false);
      }
    })();

    syncingRef.current = inFlight;

    return inFlight;
  }, [sessionId, pendingAnswers, persistPending]);

  /**
   * Recupera las respuestas que quedaron sin enviar al cerrar la pestaña. Se mandan
   * nada más abrir la sesión y el servidor descarta las que ya tenga guardadas.
   */
  useEffect(() => {
    const recovered = readPendingAnswers(sessionId);

    if (recovered.length === 0) {
      return;
    }

    answersRef.current = recovered.map((answer) => ({ ...answer, intervalLabel: "" }));
    setAnswers(answersRef.current);

    void (async () => {
      const synced = await syncAnswers();

      // La cola la reconstruye el servidor, así que hay que volver a pintar para
      // que desaparezcan las tarjetas que ya estaban respondidas.
      if (synced) {
        router.refresh();
      }
    })();
  }, [sessionId, syncAnswers, router]);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void document.documentElement.requestFullscreen().catch(() => undefined);
  }

  function toggleAudio() {
    audioPreferenceStore.set(!isAudioEnabled);
  }

  function handleReveal() {
    if (isPaused || isBusy || isBrowsing || !activeCard || revealed) {
      return;
    }

    setRevealed(true);
  }

  /**
   * Califica la tarjeta visible sin tocar el servidor.
   *
   * El planificador corre en el navegador, así que la tarjeta siguiente está lista
   * en el mismo instante en que se pulsa. La respuesta se apila y sale con las
   * demás al recorrer la cola.
   */
  function handleRate(rating: SrsRating) {
    if (isPaused || isBusy || !activeEntry || !activeCard || !revealed) {
      return;
    }

    setError(null);

    const now = new Date();
    const cardId = activeEntry.cardId;
    const outcome = applyLocalReview({
      card: activeCard,
      rating,
      settings: initialState.srsSettings,
      isCramMode: session.isCramMode,
      now,
    });

    const timeSpentMs = Math.max(0, now.getTime() - shownAt);
    const answer: SessionAnswer = {
      // La clave identifica la respuesta de forma estable: la misma tarjeta
      // calificada dos veces son dos respuestas distintas.
      key: `${cardId}#${answersRef.current.length}`,
      cardId,
      rating,
      timeSpentMs,
      reviewedAt: now.toISOString(),
      intervalLabel: outcome.intervalLabel,
    };

    const nextAnswers = [...answersRef.current, answer];

    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    persistPending();

    // El scheduling local se actualiza para que un segundo paso de aprendizaje se
    // calcule sobre el estado ya avanzado y no sobre el de entrada a la sesión.
    setCards((current) => {
      const next = new Map(current);
      next.set(cardId, { ...activeCard, scheduling: outcome.scheduling });
      return next;
    });

    const rest = queueRef.current.filter((entry) => entry.cardId !== cardId);
    const nextQueue: QueueEntry[] =
      outcome.nextDueAt !== null
        ? [{ cardId, bucket: outcome.bucket, dueAt: outcome.nextDueAt }, ...rest]
        : rest;

    queueRef.current = nextQueue;
    setQueue(nextQueue);

    const counterField = STUDY_RATING_COUNTER_FIELD[rating];

    setSession((current) => ({
      ...current,
      totalCards: current.totalCards + 1,
      totalTimeSpentMs: current.totalTimeSpentMs + timeSpentMs,
      [counterField]: current[counterField] + 1,
    }));

    setClockBase(now.getTime());
    setShownAt(now.getTime());
    setRevealed(false);
    setReviewIndex(null);

    // La sesión solo termina cuando no queda nada en la cola local: una tarjeta de
    // aprendizaje que reaparece más tarde sigue formando parte de ella. Es el
    // momento de mandar todo lo acumulado.
    if (nextQueue.length === 0) {
      void finishSession();
    }
  }

  /**
   * Cierra la sesión: primero se aseguran las respuestas pendientes y después se
   * genera el resumen. Si el envío falla no se cierra, porque el resumen saldría con
   * las cuentas a medias.
   */
  async function finishSession() {
    const synced = await syncAnswers();

    if (!synced) {
      return;
    }

    clearPendingAnswers(sessionId);

    const result = await completeStudySessionAction({ sessionId });

    if (isError(result)) {
      setError(getErrorMessage(result[1].message, "No se pudo cerrar la sesión"));
      return;
    }

    router.push(`/study/summary/${sessionId}`);
  }

  async function handlePause() {
    if (isPaused || isBusy) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      // Al reanudar la cola se reconstruye desde el servidor, así que lo que no se
      // haya enviado se manda antes de pausar.
      const synced = await syncAnswers();

      if (!synced) {
        return;
      }

      const result = await pauseStudySessionAction({
        sessionId,
        cardId: activeEntry?.cardId,
      });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo pausar la sesión"));
        return;
      }

      if (isSuccess(result)) {
        // El tiempo se congela con el valor que devuelve el servidor.
        setSession(result[0].session);
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
      const result = await resumeStudySessionAction({ sessionId });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo reanudar la sesión"));
        return;
      }

      if (isSuccess(result)) {
        const state = result[0];
        const nextCards = new Map(state.cards.map((card) => [card.id, card]));
        const nextQueue = toQueueEntries(state.queue);

        setSession(state.session);
        setCards(nextCards);
        setQueue(nextQueue);
        cardsRef.current = nextCards;
        queueRef.current = nextQueue;
        setClockBase(Date.now());
        setShownAt(Date.now());
        setRevealed(false);
        setReviewIndex(null);
        setIsPaused(false);
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
        return answersRef.current.length > 0 ? answersRef.current.length - 1 : null;
      }

      return current > 0 ? current - 1 : current;
    });
  }, []);

  const handleNext = useCallback(() => {
    setReviewIndex((current) => {
      const total = answersRef.current.length;

      if (current === null || current >= total - 1) {
        return null;
      }

      return current + 1;
    });
  }, []);

  // El manejador de teclado se registra una sola vez: los closures leen el estado
  // más reciente a través de refs en lugar de depender de él.
  const latestRef = useRef({ revealed, isPaused, isFinished, isBrowsing });
  const handlersRef = useRef({ handleReveal, handleRate, handlePause, handlePrevious, handleNext });

  useEffect(() => {
    latestRef.current = { revealed, isPaused, isFinished, isBrowsing };
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

      const rating = getYesNoRatingFromShortcut(key);

      if (rating) {
        event.preventDefault();
        handlers.handleRate(rating);
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
            onClick={toggleAudio}
            label={isAudioEnabled ? "🔊 Sonido" : "🔇 Sonido"}
            hint={
              isAudioEnabled
                ? "El anverso se pronuncia al presentar cada tarjeta. Pulsa para silenciarlo."
                : "Pronunciación silenciada. Pulsa para activarla."
            }
          />
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

      <StudyCounters counts={counts} elapsedMs={elapsedMs} answered={answers.length} />

      {unsyncedCount > 0 && (
        <p className="text-center text-xs text-secondary-foreground">
          {unsyncedCount} respuesta(s) se guardarán al terminar la cola.
        </p>
      )}

      {isSyncing && (
        <p className="text-center text-xs text-secondary-foreground">Guardando respuestas…</p>
      )}

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

            {unsyncedCount > 0 && (
              <button
                type="button"
                onClick={() => void syncAnswers()}
                disabled={isSyncing}
                className="rounded-lg border border-red-500 px-4 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                Reintentar el guardado ({unsyncedCount})
              </button>
            )}

            <button
              type="button"
              onClick={() => router.push(`/study/summary/${sessionId}`)}
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
              onClick={() => void finishSession()}
              disabled={isSyncing}
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
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
            disabled={revealed || isBusy}
            className="min-h-[16rem] w-full rounded-xl border border-border bg-background p-6 text-left transition-colors hover:bg-secondary/50 disabled:cursor-default disabled:hover:bg-background sm:min-h-[20rem]"
            aria-label={revealed ? "Reverso mostrado" : "Mostrar el reverso"}
          >
            {activeCard && <StudyCardFace card={activeCard} revealed={revealed} />}
          </button>

          {activeCard && (
            <StudyCardAudio
              card={activeCard}
              enabled={isAudioEnabled}
              autoPlayKey={revealed || isBrowsing ? null : activeCard.id}
            />
          )}

          {revealed && activeCard ? (
            <StudyYesNoBar
              card={activeCard}
              settings={initialState.srsSettings}
              isCramMode={session.isCramMode}
              disabled={isBusy}
              onRate={handleRate}
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
                Revisando ({answers[reviewIndex as number]?.rating}) · pulsa la flecha derecha para volver
              </p>
              <StudyCardFace card={browsedCard} revealed />
            </div>
          )}
        </>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-secondary-foreground">
        <span>
          Atajos: <kbd className="font-mono">espacio</kbd> revelar ·{" "}
          <kbd className="font-mono">S</kbd> sí · <kbd className="font-mono">N</kbd> no ·{" "}
          <kbd className="font-mono">←</kbd>/<kbd className="font-mono">→</kbd> recorrer ·{" "}
          <kbd className="font-mono">Esc</kbd> pausar
        </span>
        <span>
          Menos estudiadas primero ·{" "}
          <Link
            href={session.deckSlug ? `/study/deck/${session.deckSlug}` : "/study"}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Repetir el mazo
          </Link>
        </span>
      </footer>

      <PauseOverlay
        isPaused={isPaused}
        isBusy={isBusy}
        onResume={() => void handleResume()}
        onFinish={() => void finishSession()}
      />
    </div>
  );
}