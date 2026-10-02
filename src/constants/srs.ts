/** Algoritmos de repetición espaciada soportados (RF-002). */
export const SRS_ALGORITHMS = ["sm2", "fsrs"] as const;

export type SrsAlgorithm = (typeof SRS_ALGORITHMS)[number];

export const SRS_ALGORITHM_LABELS: Record<SrsAlgorithm, string> = {
  sm2: "SM-2",
  fsrs: "FSRS",
};

export const SRS_ALGORITHM_HINTS: Record<SrsAlgorithm, string> = {
  sm2: "SuperMemo 2: el intervalo se multiplica por el factor de facilidad (EF) en cada repaso.",
  fsrs: "Modelo de dificultad, estabilidad y recuperabilidad: afina el intervalo según lo que costó cada tarjeta.",
};

/** Calificaciones del usuario (RF-006). */
export const SRS_RATINGS = ["again", "hard", "good", "easy"] as const;

export type SrsRating = (typeof SRS_RATINGS)[number];

/** Calidad SM-2 (`q`) equivalente a cada calificación (RF-005). */
export const RATING_QUALITY: Record<SrsRating, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

/** Nota interna de FSRS (1 =olvidada … 4 = fácil), equivalente a `RATING_QUALITY`. */
export const RATING_GRADE: Record<SrsRating, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

export const SRS_RATING_LABELS: Record<SrsRating, string> = {
  again: "De nuevo",
  hard: "Difícil",
  good: "Bueno",
  easy: "Fácil",
};

export const SRS_RATING_HINTS: Record<SrsRating, string> = {
  again: "No he recordado la respuesta.",
  hard: "La he recordado con dificultad.",
  good: "La he recordado correctamente.",
  easy: "La he recordado sin esfuerzo.",
};

/** Atajos de teclado admitidos por calificación (RF-007). */
export const SRS_RATING_SHORTCUTS: Record<SrsRating, string[]> = {
  again: ["1", "A"],
  hard: ["2", "H"],
  good: ["3", "G"],
  easy: ["4", "E"],
};

export interface SrsRatingOption {
  value: SrsRating;
  label: string;
  hint: string;
  /** Atajos de teclado (número y letra). */
  shortcuts: string[];
  /** Botón con el color contextual de la calificación. */
  buttonClassName: string;
  /** Variante apagada para el botón cuando la opción no está seleccionada. */
  mutedButtonClassName: string;
}

export const SRS_RATING_OPTIONS: SrsRatingOption[] = [
  {
    value: "again",
    label: SRS_RATING_LABELS.again,
    hint: SRS_RATING_HINTS.again,
    shortcuts: SRS_RATING_SHORTCUTS.again,
    buttonClassName: "bg-red-500 text-white hover:bg-red-600",
    mutedButtonClassName: "border border-red-300 text-red-600 hover:bg-red-50",
  },
  {
    value: "hard",
    label: SRS_RATING_LABELS.hard,
    hint: SRS_RATING_HINTS.hard,
    shortcuts: SRS_RATING_SHORTCUTS.hard,
    buttonClassName: "bg-amber-500 text-white hover:bg-amber-600",
    mutedButtonClassName: "border border-amber-300 text-amber-700 hover:bg-amber-50",
  },
  {
    value: "good",
    label: SRS_RATING_LABELS.good,
    hint: SRS_RATING_HINTS.good,
    shortcuts: SRS_RATING_SHORTCUTS.good,
    buttonClassName: "bg-green-600 text-white hover:bg-green-700",
    mutedButtonClassName: "border border-green-300 text-green-700 hover:bg-green-50",
  },
  {
    value: "easy",
    label: SRS_RATING_LABELS.easy,
    hint: SRS_RATING_HINTS.easy,
    shortcuts: SRS_RATING_SHORTCUTS.easy,
    buttonClassName: "bg-blue-600 text-white hover:bg-blue-700",
    mutedButtonClassName: "border border-blue-300 text-blue-700 hover:bg-blue-50",
  },
];

/* ------------------------------------------------------------------------- */
/* Valores por defecto y límites de la configuración (RF-004, RF-018)          */
/* ------------------------------------------------------------------------- */

export const DEFAULT_INITIAL_EASE_FACTOR = 2.5;
export const DEFAULT_MINIMUM_EASE_FACTOR = 1.3;
export const DEFAULT_MAX_INTERVAL_DAYS = 365;
export const DEFAULT_LEARNING_STEPS = [1, 10];
export const DEFAULT_RELEARNING_STEPS = [10];

/** `srs_settings.initial_ease_factor` admite el rango 1.30 – 2.50. */
export const MIN_EASE_FACTOR = 1.3;
export const MAX_INITIAL_EASE_FACTOR = 2.5;
/** El mínimo nunca baja de 1.30 (RF-004), aunque el usuario intente bajarlo. */
export const MIN_INITIAL_EASE_FACTOR = 1.3;

export const MIN_MAX_INTERVAL_DAYS = 1;
/** Tope de seguridad: diez años de intervalo. */
export const MAX_MAX_INTERVAL_DAYS = 3650;

export const MIN_STEP_MINUTES = 1;
export const MAX_STEP_MINUTES = 1440;
export const MAX_STEPS = 8;

/** Por encima de este número de lapses se sugiere revisar la tarjeta (RF-017). */
export const LAPSE_REVIEW_THRESHOLD = 8;

/* ------------------------------------------------------------------------- */
/* Tablas de intervalos que fija la spec                                     */
/* ------------------------------------------------------------------------- */

/**
 * Retardo de una tarjeta **nueva** según la calificación (RF-009), en minutos.
 * `easy` son 1440 minutos = 1 día, que ya es un intervalo de repaso.
 */
export const NEW_CARD_DELAYS: Record<SrsRating, number> = {
  again: 1,
  hard: 6,
  good: 10,
  easy: 1440,
};

/** Intervalo en días con el que una tarjeta se gradúa a "review" (RF-010, RF-014). */
export const GRADUATION_INTERVAL_DAYS: Record<"good" | "easy", number> = {
  good: 1,
  easy: 4,
};

/**
 * Multiplicadores de intervalo en estado "review" (RF-011): `hard` × 1.2 y
 * `easy` × 1.3. La calificación "good" no aporta multiplicador propio: su
 * intervalo es exactamente `intervalo × factor de facilidad`.
 */
export const REVIEW_INTERVAL_MULTIPLIERS: Record<SrsRating, number> = {
  again: 0,
  hard: 1.2,
  good: 1,
  easy: 1.3,
};

export function isSrsAlgorithm(value: string): value is SrsAlgorithm {
  return (SRS_ALGORITHMS as readonly string[]).includes(value);
}

export function isSrsRating(value: string): value is SrsRating {
  return (SRS_RATINGS as readonly string[]).includes(value);
}



/** Traduce una tecla pulsada a una calificación (RF-007). `null` si no corresponde. */
export function getRatingFromShortcut(key: string): SrsRating | null {
  const normalized = key.trim().toLowerCase();

  for (const rating of SRS_RATINGS) {
    if (SRS_RATING_SHORTCUTS[rating].some((shortcut) => shortcut.toLowerCase() === normalized)) {
      return rating;
    }
  }

  return null;
}