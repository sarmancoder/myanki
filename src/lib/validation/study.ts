import { z } from "zod";
import { srsRatingSchema } from "@/lib/validation/srs";
import { STUDY_DAILY_STATS_DAYS, STUDY_HISTORY_PAGE_SIZE, STUDY_HISTORY_PAGE_SIZES } from "@/constants/study";

export const studySessionIdSchema = z.string().uuid("Sesión de estudio no válida");

export const studyDeckIdSchema = z
  .string()
  .uuid("Mazo no encontrado")
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

/**
 * RF-001: `deckId = null` estudia "Todos los mazos".
 * RF-022: `isCramMode` ensaya el mazo sin tocar el scheduling.
 */
export const studyStartInputSchema = z.object({
  deckId: studyDeckIdSchema,
  /** Incluye las tarjetas de los sub-mazos del mazo seleccionado. */
  includeSubdecks: z.boolean().default(true),
  isCramMode: z.boolean().default(false),
});

/** Mazo concreto para el listado de tarjetas de la pantalla de estudio. */
export const studyDeckCardsInputSchema = z.object({
  deckId: z.string().uuid("Mazo no encontrado"),
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