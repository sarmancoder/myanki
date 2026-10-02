import { RATING_GRADE, type SrsRating } from "@/constants/srs";

/**
 * Planificador FSRS (RF-002) — variante simplificada del modelo completo.
 *
 * A diferencia de SM-2, que solo recuerda un único factor de facilidad, FSRS
 * guarda dos valores por tarjeta:
 *
 * - **Dificultad (D)**: cuán difícil le resulta al usuario esa tarjeta (1-10).
 * - **Estabilidad (S)**: cuántos días aguanta el recuerdo si se respeta el
 *   objetivo de retención.
 *
 * De ahí sale la **recuperabilidad (R)** en función del tiempo transcurrido:
 * `R = (1 + FACTOR * t / S) ^ DECAY`, la misma curva de olvido exponencial
 * que usa FSRS-5.
 *
 * En `card_scheduling` se reutilizan las columnas existentes: `ease_factor`
 * guarda la dificultad D y `interval_days` guarda la estabilidad S. Como el
 * intervalo objetivo se deriva de S con retención 0.90, el valor almacenado en
 * `interval_days` es siempre aproximadamente la estabilidad.
 *
 * Los pesos están fijados a mano (no salen del optimizador de FSRS-5 sobre el
 * historial del usuario). Es una aproximación razonable y calibrada de forma
 * conservadora: cuando el optimizador esté disponible, basta con sustituir
 * `FSRS_DEFAULTS` por los parámetros aprendidos sin tocar el resto del flujo.
 */

/** Exponente de la curva de olvido (negativo). */
const DECAY = -0.5;

/** Factor de la curva de olvido. */
const FACTOR = 19 / 81;

/** Retención deseada: probabilidad de recordar cuando toca repasar. */
const DESIRED_RETENTION = 0.9;

/** Topes de dificultad (1 = fácil, 10 = imposible). */
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

/** Mínimo/máximo de días de estabilidad para evitar valores degenerados. */
const MIN_STABILITY = 0.01;
const MAX_STABILITY = 36_500;

export interface FsrsParameters {
  /** Estabilidad inicial (días) de una tarjeta nueva, por calificación. */
  initialStability: Record<SrsRating, number>;
  /** Dificultad inicial de una tarjeta nueva, por calificación. */
  initialDifficulty: Record<SrsRating, number>;
  /** Cuánto se mueve la dificultad en cada salto de calificación. */
  difficultyWeight: number;
  /** Peso de la regresión hacia la dificultad inicial (evita derivas extremas). */
  difficultyReversion: number;
  /** Base del crecimiento de estabilidad al recordar. */
  recallGrowth: Record<SrsRating, number>;
  /** Cuánto premia el modelo que la recuperación ya fuese alta (fórmula `1 - R`). */
  recallRetrievabilityGain: Record<SrsRating, number>;
  /** Fracción de estabilidad perdida al fallar. */
  lapseLoss: number;
  /** Cuánto depende de la dificultad la pérdida por lapse. */
  lapseDifficultyGain: number;
  /** Estabilidad mínima tras fallar, en días. */
  lapseMinimum: number;
}

export const FSRS_DEFAULTS: FsrsParameters = {
  initialStability: { again: 0.5, hard: 1.5, good: 4, easy: 8 },
  initialDifficulty: { again: 9, hard: 7.5, good: 5, easy: 3.5 },
  difficultyWeight: 0.9,
  difficultyReversion: 0.2,
  recallGrowth: { again: 0, hard: 0.6, good: 1, easy: 1.4 },
  recallRetrievabilityGain: { again: 0, hard: 2, good: 4, easy: 5 },
  lapseLoss: 0.6,
  lapseDifficultyGain: 0.6,
  lapseMinimum: 0.4,
};

export interface FsrsMemoryState {
  /** Dificultad (1-10). */
  difficulty: number;
  /** Estabilidad en días. */
  stability: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Dificultad de una tarjeta que se estudia por primera vez con `rating`. */
export function initialDifficulty(rating: SrsRating, params: FsrsParameters = FSRS_DEFAULTS): number {
  return clamp(roundToTwo(params.initialDifficulty[rating]), MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/** Estabilidad (días) de una tarjeta que se estudia por primera vez con `rating`. */
export function initialStability(rating: SrsRating, params: FsrsParameters = FSRS_DEFAULTS): number {
  return clamp(params.initialStability[rating], MIN_STABILITY, MAX_STABILITY);
}

/**
 * Recuperabilidad: probabilidad de recordar la tarjeta después de `elapsedDays`
 * con la estabilidad actual. Es 1 recién repasada y baja hacia 0 con el tiempo.
 */
export function retrievability(elapsedDays: number, stability: number): number {
  const safeStability = Math.max(stability, MIN_STABILITY);
  const ratio = 1 + (FACTOR * Math.max(elapsedDays, 0)) / safeStability;

  return clamp(Math.pow(ratio, DECAY), 0, 1);
}

/**
 * Días que deben pasar para que la probabilidad de recordar baje hasta
 * `DESIRED_RETENTION`. Es el intervalo que se programa para el siguiente repaso.
 */
export function intervalFromStability(
  stability: number,
  retention: number = DESIRED_RETENTION
): number {
  const safeStability = Math.max(stability, MIN_STABILITY);
  const target = clamp(retention, 0.7, 0.99);
  const days = (safeStability / FACTOR) * (Math.pow(target, 1 / DECAY) - 1);

  return clamp(days, 1, MAX_STABILITY);
}

/**
 * Dificultad tras calificar. Sube al fallar, baja al recordar fácil y queda
 * acotada en 1-10.
 */
export function nextDifficulty(
  difficulty: number,
  rating: SrsRating,
  params: FsrsParameters = FSRS_DEFAULTS
): number {
  const grade = RATING_GRADE[rating];
  const delta = -params.difficultyWeight * (grade - 3);
  const updated = difficulty + delta;
  const reverted =
    params.difficultyReversion * params.initialDifficulty[rating] +
    (1 - params.difficultyReversion) * updated;

  return clamp(roundToTwo(reverted), MIN_DIFFICULTY, MAX_DIFFICULTY);
}

/**
 * Estabilidad tras calificar.
 *
 * - Recordar multiplica la estabilidad: cuanto más fácil era la tarjeta y
 *   menos costaba recordarla, más crece.
 * - Fallar la reduce según la dificultad, y nunca por debajo de `lapseMinimum`
 *   para que la tarjeta siga reapareciendo pronto.
 */
export function nextStability(
  state: FsrsMemoryState,
  elapsedDays: number,
  rating: SrsRating,
  params: FsrsParameters = FSRS_DEFAULTS
): number {
  const difficulty = clamp(state.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY);
  const stability = clamp(state.stability, MIN_STABILITY, MAX_STABILITY);
  const grade = RATING_GRADE[rating];

  if (grade <= 1) {
    // Fallar recorta la estabilidad; cuanto más difícil era la tarjeta, más se
    // pierde, pero nunca por debajo del mínimo (si no, reaparece en minutos).
    const lossRate = clamp(
      params.lapseLoss * (0.6 + (difficulty / 10) * params.lapseDifficultyGain),
      0.05,
      0.95
    );
    const lost = Math.max(params.lapseMinimum, stability * (1 - lossRate));

    return clamp(roundToTwo(Math.min(stability, lost)), MIN_STABILITY, MAX_STABILITY);
  }

  // Recordar crece en proporción a lo fácil que era la tarjeta y a lo que ya se
  // recordaba: un repaso con R ≈ 1 (hecho demasiado pronto) aporta muy poco.
  const currentRetrievability = retrievability(elapsedDays, stability);
  const growth =
    params.recallGrowth[rating] *
    (1 - difficulty / 10) *
    (1 - currentRetrievability) *
    params.recallRetrievabilityGain[rating];

  return clamp(roundToTwo(stability * (1 + growth)), MIN_STABILITY, MAX_STABILITY);
}

/**
 * Intervalo programado (en días) para el siguiente repaso tras calificar con
 * `rating`, junto con la dificultad y la estabilidad resultantes.
 *
 * Para "again" devuelve 0 días: lo que reaparece a los minutos es una tarjeta
 * en reaprendizaje, no una revisión de días.
 */
export function nextSchedule(
  state: FsrsMemoryState,
  elapsedDays: number,
  rating: SrsRating,
  params: FsrsParameters = FSRS_DEFAULTS
): FsrsMemoryState & { intervalDays: number } {
  const difficulty = nextDifficulty(state.difficulty, rating, params);

  if (RATING_GRADE[rating] <= 1) {
    return { difficulty, stability: nextStability(state, elapsedDays, rating, params), intervalDays: 0 };
  }

  const stability = nextStability(state, elapsedDays, rating, params);

  return { difficulty, stability, intervalDays: Math.round(intervalFromStability(stability)) };
}