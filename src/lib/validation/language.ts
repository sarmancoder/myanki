import { z } from "zod";

export const MAX_LANGUAGE_NAME_LENGTH = 40;

export const languageIdSchema = z.string().uuid("Idioma no válido");

/**
 * El idioma no es una lista cerrada: cualquier código ISO 639-1 sirve (y también
 * variantes del tipo `zh-Hant`). Solo se exige minúsculas para que las comparaciones
 * y los filtros no dependan de cómo lo escribió el usuario.
 */
export const languageCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "El código debe tener al menos 2 caracteres")
  .max(10, "El código no puede superar los 10 caracteres")
  .regex(/^[a-z][a-z0-9-]*$/, "El código solo admite letras minúsculas, números y guiones");

export const languageNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre del idioma es obligatorio")
  .max(
    MAX_LANGUAGE_NAME_LENGTH,
    `El nombre no puede superar los ${MAX_LANGUAGE_NAME_LENGTH} caracteres`
  );

/** La bandera es opcional y se normaliza a `null` cuando se deja en blanco. */
const languageFlagSchema = z
  .string()
  .trim()
  .max(8, "La bandera no puede superar los 8 caracteres")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

export const languageCreateInputSchema = z.object({
  code: languageCodeSchema,
  name: languageNameSchema,
  flag: languageFlagSchema,
});

export const languageUpdateInputSchema = z.object({
  id: languageIdSchema,
  name: languageNameSchema.optional(),
  flag: languageFlagSchema,
  sortOrder: z.number().int().min(0).optional(),
});

export const languageIdInputSchema = z.object({
  id: languageIdSchema,
});

export type LanguageCreateInput = z.infer<typeof languageCreateInputSchema>;
export type LanguageUpdateInput = z.infer<typeof languageUpdateInputSchema>;