import { z } from "zod";
import { CARD_STATUSES } from "@/constants/cards";
import {
  DEFAULT_INITIAL_EASE_FACTOR,
  DEFAULT_LEARNING_STEPS,
  DEFAULT_MAX_INTERVAL_DAYS,
  DEFAULT_MINIMUM_EASE_FACTOR,
  DEFAULT_RELEARNING_STEPS,
  MAX_INITIAL_EASE_FACTOR,
  MAX_MAX_INTERVAL_DAYS,
  MAX_STEPS,
  MAX_STEP_MINUTES,
  MIN_EASE_FACTOR,
  MIN_INITIAL_EASE_FACTOR,
  MIN_MAX_INTERVAL_DAYS,
  MIN_STEP_MINUTES,
  SRS_ALGORITHMS,
  SRS_RATINGS,
} from "@/constants/srs";

export const SRS_DUE_PAGE_SIZE = 20;
export const SRS_DUE_PAGE_SIZES = [20, 50, 100] as const;

export const srsAlgorithmSchema = z.enum(SRS_ALGORITHMS, {
  error: "Selecciona un algoritmo válido",
});

export const srsRatingSchema = z.enum(SRS_RATINGS, { error: "Selecciona una calificación válida" });

/** El factor inicial solo mueve la dificultad hacia arriba, como en la spec. */
export const srsInitialEaseFactorSchema = z
  .number()
  .min(MIN_INITIAL_EASE_FACTOR, `El factor inicial no puede bajar de ${MIN_INITIAL_EASE_FACTOR.toFixed(2)}`)
  .max(MAX_INITIAL_EASE_FACTOR, `El factor inicial no puede subir de ${MAX_INITIAL_EASE_FACTOR.toFixed(2)}`);

export const srsMinimumEaseFactorSchema = z
  .number()
  .min(MIN_EASE_FACTOR, `El factor mínimo no puede bajar de ${MIN_EASE_FACTOR.toFixed(2)}`);

export const srsMaxIntervalDaysSchema = z
  .number()
  .int("El intervalo máximo debe ser un número entero")
  .min(MIN_MAX_INTERVAL_DAYS, "El intervalo máximo debe ser de al menos 1 día")
  .max(MAX_MAX_INTERVAL_DAYS, `El intervalo máximo no puede superar los ${MAX_MAX_INTERVAL_DAYS} días`);

/**
 * Escalera de aprendizaje en minutos: enteros positivos, crecientes y sin
 * repetir. El orden importa porque "hard" se queda a medias entre dos pasos.
 */
export const srsStepsSchema = z
  .array(
    z
      .number()
      .int("Los pasos deben ser números enteros de minutos")
      .min(MIN_STEP_MINUTES, `Cada paso debe durar al menos ${MIN_STEP_MINUTES} minuto`)
      .max(MAX_STEP_MINUTES, `Cada paso puede durar como máximo ${MAX_STEP_MINUTES} minutos`)
  )
  .min(1, "Indica al menos un paso de aprendizaje")
  .max(MAX_STEPS, `Indica como máximo ${MAX_STEPS} pasos`)
  .refine((steps) => steps.every((step, index) => index === 0 || step > steps[index - 1]), {
    error: "Los pasos deben ir de menor a mayor y sin repeticiones",
  });

export const srsSettingsUpdateInputSchema = z.object({
  algorithm: srsAlgorithmSchema,
  initialEaseFactor: srsInitialEaseFactorSchema,
  minimumEaseFactor: srsMinimumEaseFactorSchema,
  maxIntervalDays: srsMaxIntervalDaysSchema,
  learningSteps: srsStepsSchema,
  relearningSteps: srsStepsSchema,
});

export const srsSettingsInputSchema = srsSettingsUpdateInputSchema.partial().default({});

/** `steps` en minutos; el servidor usa solo el primer paso para el lapse desde review. */
export const srsPreviewInputSchema = z.object({
  status: z.enum(CARD_STATUSES, { error: "Estado de tarjeta no válido" }).default("review"),
  intervalDays: z.number().int().min(0).max(MAX_MAX_INTERVAL_DAYS).default(10),
  easeFactor: srsInitialEaseFactorSchema.default(DEFAULT_INITIAL_EASE_FACTOR),
  repetitions: z.number().int().min(0).max(100_000).default(3),
  lapses: z.number().int().min(0).max(100_000).default(0),
  elapsedDays: z.number().min(0).max(MAX_MAX_INTERVAL_DAYS).default(10),
});

/**
 * Estado simulado para la vista previa. Todos los campos tienen valor por
 * defecto, así que un `state` vacío (o ausente) devuelve los intervalos de una
 * tarjeta en review sana.
 */
export const srsCalculateInputSchema = z.object({
  state: srsPreviewInputSchema.prefault({}),
});

export const srsReviewInputSchema = z.object({
  cardId: z.string().uuid("Tarjeta no encontrada"),
  rating: srsRatingSchema,
  /** Milisegundos que el usuario tardó en responder (opcional, para las estadísticas). */
  timeSpentMs: z.number().int().min(0).max(1000 * 60 * 60).optional(),
  studySessionId: z.string().uuid("Sesión de estudio no válida").optional(),
});

export const srsDueCardsInputSchema = z.object({
  deckId: z.string().uuid("Mazo no encontrado"),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) => (SRS_DUE_PAGE_SIZES as readonly number[]).includes(value), {
      error: "Tamaño de página no válido",
    })
    .default(SRS_DUE_PAGE_SIZE),
  /** Al crear o actualizar tarjetas nuevas se adelanta su `due_date` a hoy. */
  includeNew: z.boolean().default(true),
});

export type SrsSettingsUpdateInput = z.infer<typeof srsSettingsUpdateInputSchema>;

/** Estado simulado con el que se calcula la vista previa de intervalos. */
export type SrsPreviewState = z.infer<typeof srsPreviewInputSchema>;

/** Escaleras por defecto, reutilizadas por el reset de configuración. */
export const DEFAULT_SRS_FORM_VALUES = {
  algorithm: "sm2" as const,
  initialEaseFactor: DEFAULT_INITIAL_EASE_FACTOR,
  minimumEaseFactor: DEFAULT_MINIMUM_EASE_FACTOR,
  maxIntervalDays: DEFAULT_MAX_INTERVAL_DAYS,
  learningSteps: [...DEFAULT_LEARNING_STEPS],
  relearningSteps: [...DEFAULT_RELEARNING_STEPS],
};