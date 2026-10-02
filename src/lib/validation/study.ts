import { z } from "zod";
import { srsRatingSchema } from "@/lib/validation/srs";
import {
  MAX_STUDY_MAX_CARDS,
  MIN_STUDY_MAX_CARDS,
  STUDY_DAILY_STATS_DAYS,
  STUDY_EARLY_DAY_OPTIONS,
  STUDY_HISTORY_PAGE_SIZE,
  STUDY_HISTORY_PAGE_SIZES,
} from "@/constants/study";

/** Máximo de días de adelanto admitidos en el estudio anticipado (RF-017). */
export const MAX_STUDY_EARLY_DAYS = Math.max(...STUDY_EARLY_DAY_OPTIONS);

export const studySessionIdSchema = z.string().uuid("Sesión de estudio no válida");

export const studyEarlyDaysSchema = z
  .number()
  .int("Los días de adelanto deben ser un número entero")
  .min(0, "Los días de adelanto no pueden ser negativos")
  .max(MAX_STUDY_EARLY_DAYS, `El estudio anticipado llega como máximo ${MAX_STUDY_EARLY_DAYS} días`)
  .default(0);

export const studyMaxCardsSchema = z
  .number()
  .int("El número de tarjetas debe ser un entero")
  .min(MIN_STUDY_MAX_CARDS, `Estudia al menos ${MIN_STUDY_MAX_CARDS} tarjetas por sesión`)
  .max(MAX_STUDY_MAX_CARDS, `Estudia como máximo ${MAX_STUDY_MAX_CARDS} tarjetas por sesión`);

export const studyDeckIdSchema = z
  .string()
  .uuid("Mazo no encontrado")
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

/**
 * RF-001: `deckId = null` estudia "Todos los mazos".
 * RF-017: `earlyDays > 0` amplía la ventana de vencimiento.
 * RF-022: `isCramMode` ignora las fechas de vencimiento.
 */
export const studyStartInputSchema = z.object({
  deckId: studyDeckIdSchema,
  /** Incluye las tarjetas de los sub-mazos del mazo seleccionado. */
  includeSubdecks: z.boolean().default(true),
  earlyDays: studyEarlyDaysSchema,
  isCramMode: z.boolean().default(false),
  maxCards: studyMaxCardsSchema.optional(),
});

export const studySessionInputSchema = z.object({
  sessionId: studySessionIdSchema,
});

export const studyReviewInputSchema = z.object({
  sessionId: studySessionIdSchema,
  cardId: z.string().uuid("Tarjeta no encontrada"),
  rating: srsRatingSchema,
  /** Milisegundos que el usuario tardó en responder (RF-013). */
  timeSpentMs: z.number().int().min(0).max(1000 * 60 * 60).optional(),
});

/** Al pausar se guarda la tarjeta visible para poder retomarla tal cual (RF-019). */
export const studyPauseInputSchema = studySessionInputSchema.extend({
  cardId: z.string().uuid("Tarjeta no encontrada").optional(),
});

export const studyCompleteInputSchema = studySessionInputSchema;

export const studyHistoryInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) => (STUDY_HISTORY_PAGE_SIZES as readonly number[]).includes(value), {
      error: "Tamaño de página no válido",
    })
    .default(STUDY_HISTORY_PAGE_SIZE),
});

export const studyDailyStatsInputSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .default(STUDY_DAILY_STATS_DAYS),
});

export const studyOverviewInputSchema = z.object({
  deckId: studyDeckIdSchema,
});

export type StudyStartInput = z.infer<typeof studyStartInputSchema>;