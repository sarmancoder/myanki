import type { CardStatus } from "@/constants/cards";
import type { SrsRating } from "@/constants/srs";
import { STUDY_CRAM_INTERVAL_LABEL } from "@/constants/study";
import { calculateNextSchedule, formatInterval, type SrsScheduleState } from "@/lib/srs/algorithm";
import { elapsedDays } from "@/lib/srs/dates";
import { bucketForStatus } from "@/lib/study/queue";
import type { StudyCardSchedulingView, StudyCardView, StudySrsScheduleSettings } from "@/types/study";

/**
 * Cálculo del SRS en el navegador.
 *
 * El planificador es puro y ya se usaba en el cliente para pintar los intervalos
 * de los botones (RF-009), así que calificar no necesita ir al servidor: la
 * interfaz resuelve la siguiente fecha, el intervalo y a qué cubo vuelve la
 * tarjeta, y solo cuando se recorre toda la cola envía el lote de respuestas.
 *
 * El servidor sigue siendo la fuente de verdad: cuando el lote llega vuelve a
 * pasar estas mismas respuestas por `applySrsReview`, con el mismo algoritmo y con
 * la misma fecha, de modo que el resultado guardado coincide con el que se vio en
 * pantalla.
 */

export interface LocalReviewOutcome {
  /** Estado del SRS tras aplicar la calificación. */
  status: CardStatus;
  /** Intervalo listo para pintar: "10 min", "1 día", "4 días". */
  intervalLabel: string;
  /**
   * Epoch ms en el que la tarjeta vuelve a la cola de la sesión, o `null` si ya
   * no sale hoy (por ejemplo, una tarjeta graduada a "review").
   */
  nextDueAt: number | null;
  /** Cubo del contador al que pasa la tarjeta (RF-012). */
  bucket: ReturnType<typeof bucketForStatus>;
  /**
   * Scheduling resultante. Se sustituye en la copia local de la tarjeta para que
   * el siguiente paso de aprendizaje se calcule sobre el estado ya actualizado.
   */
  scheduling: StudyCardSchedulingView;
}

/**
 * Estado del scheduling tal y como lo consume el algoritmo. Solo difiere del que
 * arma el servidor en que `lastReviewedAt` viaja como ISO en lugar de `Date`.
 */
export function toLocalScheduleState(
  scheduling: StudyCardSchedulingView,
  now: Date = new Date()
): SrsScheduleState {
  return {
    status: scheduling.status,
    easeFactor: scheduling.easeFactor,
    intervalDays: Math.max(scheduling.intervalDays, 0),
    repetitions: scheduling.repetitions,
    lapses: scheduling.lapses,
    elapsedDays: elapsedDays(
      scheduling.lastReviewedAt ? new Date(scheduling.lastReviewedAt) : null,
      now
    ),
  };
}

export interface LocalReviewParams {
  card: StudyCardView;
  rating: SrsRating;
  settings: StudySrsScheduleSettings;
  /** En modo cram no se programa nada y la tarjeta no vuelve a salir hoy (RF-023). */
  isCramMode: boolean;
  now?: Date;
}

/**
 * Aplica una calificación en local y devuelve tanto lo que se pinta como el
 * scheduling actualizado de la tarjeta.
 */
export function applyLocalReview({
  card,
  rating,
  settings,
  isCramMode,
  now = new Date(),
}: LocalReviewParams): LocalReviewOutcome {
  // RF-023: el modo cram es solo práctica, así que el estado no se toca y la
  // tarjeta se da por vista para el resto de la sesión.
  if (isCramMode) {
    return {
      status: card.scheduling.status,
      intervalLabel: STUDY_CRAM_INTERVAL_LABEL,
      nextDueAt: null,
      bucket: bucketForStatus(card.scheduling.status),
      scheduling: card.scheduling,
    };
  }

  const result = calculateNextSchedule(toLocalScheduleState(card.scheduling, now), rating, settings, now);

  // La tarjeta vuelve a la cola solo si el planificador la reprograma para dentro
  // del mismo día (pasos de aprendizaje y reaprendizaje).
  const comesBackLater = result.status === "learning" || result.status === "relearning";

  return {
    status: result.status,
    intervalLabel: formatInterval(result.delayMinutes, result.intervalDays),
    nextDueAt: comesBackLater ? result.dueDate.getTime() : null,
    bucket: bucketForStatus(result.status),
    scheduling: {
      status: result.status,
      intervalDays: result.intervalDays,
      easeFactor: result.easeFactor,
      repetitions: result.repetitions,
      lapses: result.lapses,
      lastReviewedAt: now.toISOString(),
    },
  };
}