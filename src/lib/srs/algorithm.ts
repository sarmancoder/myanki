import type { CardStatus } from "@/constants/cards";
import {
  GRADUATION_INTERVAL_DAYS,
  LAPSE_REVIEW_THRESHOLD,
  MAX_INITIAL_EASE_FACTOR,
  MAX_STEPS,
  MIN_EASE_FACTOR,
  NEW_CARD_DELAYS,
  REVIEW_INTERVAL_MULTIPLIERS,
  SRS_RATINGS,
  type SrsAlgorithm,
  type SrsRating,
} from "@/constants/srs";
import { RATING_QUALITY } from "@/constants/srs";
import {
  FSRS_DEFAULTS,
  nextSchedule as nextFsrsSchedule,
  roundToTwo,
} from "@/lib/srs/fsrs";

/**
 * Estado de scheduling normalizado que consume el algoritmo, sin tipos de
 * Prisma. Es la entrada de `calculateNextSchedule` y de `previewIntervals`.
 */
export interface SrsScheduleState {
  status: CardStatus;
  /** SM-2: factor de facilidad. FSRS: dificultad (1-10). */
  easeFactor: number;
  /** Días de intervalo programados. 0 en learning/relearning. */
  intervalDays: number;
  repetitions: number;
  lapses: number;
  /** Días transcurridos desde el último repaso (0 si nunca se ha repasado). */
  elapsedDays: number;
}

export interface SrsScheduleResult {
  status: CardStatus;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  /** Retardo intradía hasta el siguiente repaso (0 cuando el intervalo es en días). */
  delayMinutes: number;
  /** Fecha exacta de vencimiento, con hora: la consume el módulo de estudio. */
  dueDate: Date;
  /** RF-017: la tarjeta acumula demasiados lapses. */
  shouldReviewCard: boolean;
}

/** Configuración efectiva del usuario, ya validada. */
export interface SrsScheduleSettings {
  algorithm: SrsAlgorithm;
  initialEaseFactor: number;
  minimumEaseFactor: number;
  maxIntervalDays: number;
  learningSteps: number[];
  relearningSteps: number[];
}

export interface SrsRatingPreview {
  rating: SrsRating;
  status: CardStatus;
  easeFactor: number;
  intervalDays: number;
  delayMinutes: number;
  /** Etiqueta lista para pintar: "10 min", "1 día", "4 días" (RF-008). */
  intervalLabel: string;
  dueDate: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Redondea a 2 decimales: la precisión de la columna `ease_factor DECIMAL(4,2)`. */
export function roundEaseFactor(value: number): number {
  return roundToTwo(value);
}

/**
 * Factor de facilidad con el que arranca (o se recupera) una tarjeta.
 *
 * Una tarjeta nunca repasada (`new`) o sin valor guardado arranca en el factor
 * inicial configurado; el resto mantiene su factor acotado por el mínimo (RF-004).
 */
export function resolveEaseFactor(state: SrsScheduleState, settings: SrsScheduleSettings): number {
  const minimum = Math.max(settings.minimumEaseFactor, MIN_EASE_FACTOR);

  if (state.easeFactor <= 0) {
    return clamp(settings.initialEaseFactor, MIN_EASE_FACTOR, MAX_INITIAL_EASE_FACTOR);
  }

  return clamp(state.easeFactor, minimum, MAX_INITIAL_EASE_FACTOR);
}

/**
 * SM-2 (RF-001, RF-005): `EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))`,
 * donde `q` es la calidad de la calificación (again=1, hard=3, good=4, easy=5).
 *
 * El factor nunca baja del mínimo configurado ni del 1.30 absoluto (RF-004).
 */
export function calculateEaseFactor(
  currentEaseFactor: number,
  rating: SrsRating,
  settings: Pick<SrsScheduleSettings, "minimumEaseFactor">
): number {
  const quality = RATING_QUALITY[rating];
  const next = currentEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const minimum = Math.max(settings.minimumEaseFactor, MIN_EASE_FACTOR);

  return roundEaseFactor(Math.max(next, minimum));
}

/**
 * Retardo intradía de la escalera de aprendizaje/reaprendizaje (RF-018).
 *
 * - `again` vuelve al primer paso (1 min por defecto).
 * - `hard` se queda a medias de camino entre el paso actual y el siguiente, que
 *   con la escalera por defecto `1 10` da los 6 min que fija la spec (RF-010).
 */
export function resolveStepDelay(
  steps: number[],
  fallbackMinutes: number,
  rating: SrsRating
): number {
  const ladder = steps.length > 0 ? steps : [fallbackMinutes];

  if (rating === "again") {
    return ladder[0];
  }

  if (rating === "hard") {
    // Con dos o más pasos, "hard" se queda a medias entre el primero y el
    // segundo (6 min con la escalera por defecto `1 10`). Con un único paso no
    // hay a dónde interpolar, así que se repite ese mismo paso.
    return ladder.length > 1 ? Math.max(1, Math.round((ladder[0] + ladder[1]) / 2)) : ladder[0];
  }

  return fallbackMinutes;
}

function dueDateFromDelay(now: Date, delayMinutes: number): Date {
  return new Date(now.getTime() + delayMinutes * 60_000);
}

function buildResult(
  params: Omit<SrsScheduleResult, "shouldReviewCard">,
  lapseThreshold: number
): SrsScheduleResult {
  return {
    ...params,
    shouldReviewCard: params.lapses > lapseThreshold,
  };
}

/**
 * Intervalo de review aplicando los multiplicadores de la spec (RF-011, RF-012):
 * `hard` × 1.2, `good` × factor de facilidad y `easy` × factor de facilidad × 1.3.
 *
 * Una tarjeta en review sin intervalo previo (importada o reiniciada) se trata
 * como si acabara de graduarse: el intervalo base es de un día.
 */
function sm2ReviewInterval(
  state: SrsScheduleState,
  rating: SrsRating,
  easeFactor: number,
  settings: SrsScheduleSettings
): number {
  const base = state.intervalDays > 0 ? state.intervalDays : 1;
  const multiplier = REVIEW_INTERVAL_MULTIPLIERS[rating];
  // Solo "good" y "easy" multiplican por el factor de facilidad; "hard" usa su
  // propio multiplicador fijo para no premiar dos veces el mismo acierto.
  const next =
    rating === "good" || rating === "easy"
      ? base * easeFactor * multiplier
      : base * multiplier;

  return clamp(Math.round(next), 1, settings.maxIntervalDays);
}

/**
 * Calcula el estado completo de una tarjeta tras calificar con `rating`.
 *
 * Cubre las transiciones de RF-014 y los intervalos de RF-009 (new), RF-010
 * (learning/relearning) y RF-011 (review), contando lapses (RF-015),
 * repasos exitosos (RF-016) y el aviso de tarjeta problemática (RF-017).
 *
 * Es la única fuente de verdad del módulo: la usan igual el guardado real
 * (`srs.review`), la vista previa de intervalos (`srs.calculate`) y la
 * previsualización en la página de ajustes.
 */
export function calculateNextSchedule(
  state: SrsScheduleState,
  rating: SrsRating,
  settings: SrsScheduleSettings,
  now: Date = new Date(),
  lapseThreshold: number = LAPSE_REVIEW_THRESHOLD
): SrsScheduleResult {
  const easeFactor = resolveEaseFactor(state, settings);
  // Solo cuentan como repaso exitoso las calificaciones distintas de "again"
  // (RF-016); "again" solo suma lapse (RF-015).
  const repetitions = state.repetitions + (rating === "again" ? 0 : 1);
  const lapses = state.lapses + (rating === "again" ? 1 : 0);
  const isFirstReview = state.repetitions === 0 && state.lapses === 0 && state.status === "new";

  // El factor de facilidad se ajusta en cada calificación salvo en el primer
  // repaso de una tarjeta nueva, que arranca en el valor inicial configurado
  // (RF-004). Con FSRS la dificultad la gestiona su propio modelo.
  const nextEaseFactor =
    settings.algorithm === "sm2" && !isFirstReview
      ? calculateEaseFactor(easeFactor, rating, settings)
      : easeFactor;

  if (state.status === "new") {
    return scheduleNewCard(nextEaseFactor, repetitions, lapses, rating, now, lapseThreshold);
  }

  if (state.status === "learning" || state.status === "relearning") {
    return scheduleLearningCard(
      state,
      nextEaseFactor,
      repetitions,
      lapses,
      rating,
      settings,
      now,
      lapseThreshold
    );
  }

  return scheduleReviewCard(
    state,
    nextEaseFactor,
    repetitions,
    lapses,
    rating,
    settings,
    now,
    lapseThreshold
  );
}

/**
 * Tarjeta nueva (RF-009): los retardos vienen de la tabla fija de la spec, no
 * de la escalera configurable, para que el primer repaso sea idéntico en todas
 * las instalaciones. "easy" la gradúa a review con 1 día; el resto entra en
 * learning (RF-014).
 */
function scheduleNewCard(
  easeFactor: number,
  repetitions: number,
  lapses: number,
  rating: SrsRating,
  now: Date,
  lapseThreshold: number
): SrsScheduleResult {
  const delayMinutes = NEW_CARD_DELAYS[rating];

  if (rating === "easy") {
    return buildResult(
      {
        status: "review",
        easeFactor,
        intervalDays: 1,
        repetitions,
        lapses,
        delayMinutes: 0,
        dueDate: dueDateFromDelay(now, delayMinutes),
      },
      lapseThreshold
    );
  }

  return buildResult(
    {
      status: "learning",
      easeFactor,
      intervalDays: 0,
      repetitions,
      lapses,
      delayMinutes,
      dueDate: dueDateFromDelay(now, delayMinutes),
    },
    lapseThreshold
  );
}

/**
 * Tarjeta en aprendizaje o reaprendizaje (RF-010):
 * `again` vuelve al primer paso, `hard` se queda a mitad de escalera y
 * `good`/`easy` graduate a review con 1 y 4 días (RF-014).
 */
function scheduleLearningCard(
  state: SrsScheduleState,
  easeFactor: number,
  repetitions: number,
  lapses: number,
  rating: SrsRating,
  settings: SrsScheduleSettings,
  now: Date,
  lapseThreshold: number
): SrsScheduleResult {
  const isRelearning = state.status === "relearning";
  const steps = isRelearning ? settings.relearningSteps : settings.learningSteps;

  if (rating === "good" || rating === "easy") {
    const intervalDays = GRADUATION_INTERVAL_DAYS[rating];

    return buildResult(
      {
        status: "review",
        easeFactor,
        intervalDays,
        repetitions,
        lapses,
        delayMinutes: 0,
        dueDate: dueDateFromDelay(now, intervalDays * 24 * 60),
      },
      lapseThreshold
    );
  }

  const delayMinutes = resolveStepDelay(steps, NEW_CARD_DELAYS[rating], rating);

  return buildResult(
    {
      status: state.status,
      easeFactor,
      intervalDays: 0,
      repetitions,
      lapses,
      delayMinutes,
      dueDate: dueDateFromDelay(now, delayMinutes),
    },
    lapseThreshold
  );
}

/**
 * Tarjeta en repaso (RF-011): `again` vuelve a "relearning" con 10 minutos,
 * `hard` multiplica por 1.2, `good` por el factor de facilidad y `easy` por el
 * factor de facilidad × 1.3. Con FSRS el intervalo sale de dificultad y
 * estabilidad. El resultado siempre está acotado por el intervalo máximo (RF-012).
 */
function scheduleReviewCard(
  state: SrsScheduleState,
  easeFactor: number,
  repetitions: number,
  lapses: number,
  rating: SrsRating,
  settings: SrsScheduleSettings,
  now: Date,
  lapseThreshold: number
): SrsScheduleResult {
  if (rating === "again") {
    const delayMinutes = settings.relearningSteps[0] ?? NEW_CARD_DELAYS.again;

    return buildResult(
      {
        status: "relearning",
        easeFactor,
        intervalDays: 0,
        repetitions,
        lapses,
        delayMinutes,
        dueDate: dueDateFromDelay(now, delayMinutes),
      },
      lapseThreshold
    );
  }

  const intervalDays =
    settings.algorithm === "sm2"
      ? sm2ReviewInterval(state, rating, easeFactor, settings)
      : nextFsrsSchedule(
          { difficulty: easeFactor, stability: Math.max(state.intervalDays, 0.5) },
          state.elapsedDays,
          rating,
          FSRS_DEFAULTS
        ).intervalDays;

  const days = clamp(Math.max(intervalDays, 1), 1, settings.maxIntervalDays);

  return buildResult(
    {
      status: "review",
      easeFactor,
      intervalDays: days,
      repetitions,
      lapses,
      delayMinutes: 0,
      dueDate: dueDateFromDelay(now, days * 24 * 60),
    },
    lapseThreshold
  );
}

/** Vista previa de los cuatro intervalos que se muestran antes de calificar (RF-008). */
export function previewIntervals(
  state: SrsScheduleState,
  settings: SrsScheduleSettings,
  now: Date = new Date(),
  lapseThreshold: number = LAPSE_REVIEW_THRESHOLD
): SrsRatingPreview[] {
  return SRS_RATINGS.map((rating) => {
    const result = calculateNextSchedule(state, rating, settings, now, lapseThreshold);

    return {
      rating,
      status: result.status,
      easeFactor: result.easeFactor,
      intervalDays: result.intervalDays,
      delayMinutes: result.delayMinutes,
      intervalLabel: formatInterval(result.delayMinutes, result.intervalDays),
      dueDate: result.dueDate.toISOString(),
    };
  });
}

/** Etiqueta legible del intervalo: "10 min", "1 día", "4 días" (RF-008). */
export function formatInterval(delayMinutes: number, intervalDays: number): string {
  if (delayMinutes > 0) {
    if (delayMinutes < 60) {
      return `${delayMinutes} min`;
    }

    if (delayMinutes < 24 * 60) {
      const hours = delayMinutes / 60;

      return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
    }

    return formatInterval(0, Math.round(delayMinutes / (24 * 60)));
  }

  if (intervalDays <= 0) {
    return "—";
  }

  if (intervalDays === 1) {
    return "1 día";
  }

  // El corte en meses se deja en 60 días (dos meses) y no en 30 para que un
  // intervalo de 5 semanas siga leyéndose en días exactos, que es el número
  // que el usuario puede comprobar contra la ficha de la tarjeta.
  if (intervalDays < 60) {
    return `${intervalDays} días`;
  }

  if (intervalDays < 365) {
    const months = Math.round(intervalDays / 30);

    return months === 1 ? "1 mes" : `${months} meses`;
  }

  const years = Math.round((intervalDays / 365) * 10) / 10;

  return years === 1 ? "1 año" : `${years} años`;
}

/** Escala y sanea una escalera de aprendizaje recibida desde el formulario. */
export function normalizeSteps(steps: number[], fallback: number[]): number[] {
  const cleaned = steps
    .map((step) => Math.round(step))
    .filter((step) => Number.isFinite(step) && step > 0);

  if (cleaned.length === 0) {
    return [...fallback];
  }

  return cleaned.slice(0, MAX_STEPS);
}