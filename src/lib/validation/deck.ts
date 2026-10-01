import { z } from "zod";
import { LANGUAGE_CODES } from "@/constants/languages";

/** Profundidad máxima de la jerarquía: raíz (1) + 2 niveles de sub-mazos. */
export const MAX_DECK_DEPTH = 3;
export const MAX_DECK_NAME_LENGTH = 100;
export const MAX_DECK_DESCRIPTION_LENGTH = 500;
export const MAX_IMPORT_LENGTH = 2_000_000;

export const deckNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre del mazo es obligatorio")
  .max(MAX_DECK_NAME_LENGTH, `El nombre no puede superar los ${MAX_DECK_NAME_LENGTH} caracteres`);

/**
 * La descripción llega como texto plano. Su normalización a `null` se hace en el
 * router para poder distinguir "no enviada" de "enviada vacía".
 */
export const deckDescriptionSchema = z
  .string()
  .trim()
  .max(
    MAX_DECK_DESCRIPTION_LENGTH,
    `La descripción no puede superar los ${MAX_DECK_DESCRIPTION_LENGTH} caracteres`
  );

export const deckLanguageSchema = z.enum(LANGUAGE_CODES, {
  error: "Selecciona un idioma válido",
});

export const deckSortSchema = z.enum(["name", "createdAt", "cards"]);
export const deckSortOrderSchema = z.enum(["asc", "desc"]);
export const duplicateStrategySchema = z.enum(["skip", "replace", "copy"]);
export const exportFormatSchema = z.enum(["json", "csv"]);
export const importFormatSchema = z.enum(["json", "csv"]);

export const deckListInputSchema = z.object({
  language: deckLanguageSchema.nullable().optional(),
  search: z.string().trim().max(100, "La búsqueda es demasiado larga").optional(),
  sort: deckSortSchema.default("createdAt"),
  order: deckSortOrderSchema.default("desc"),
  includeArchived: z.boolean().default(false),
});

export const deckCreateInputSchema = z.object({
  name: deckNameSchema,
  description: deckDescriptionSchema.optional(),
  languageCode: deckLanguageSchema.optional(),
  parentDeckId: z.string().uuid("Identificador de mazo padre no válido").nullish(),
});

export const deckUpdateInputSchema = z.object({
  id: z.string().uuid("Mazo no encontrado"),
  name: deckNameSchema.optional(),
  description: deckDescriptionSchema.optional(),
  languageCode: deckLanguageSchema.optional(),
  parentDeckId: z.string().uuid("Identificador de mazo padre no válido").nullish(),
});

export const deckIdInputSchema = z.object({
  id: z.string().uuid("Mazo no encontrado"),
});

export const deckSlugInputSchema = z.object({
  slug: z.string().trim().min(1, "Mazo no encontrado").max(120),
});

export const deckOptionsInputSchema = z.object({
  excludeDeckId: z.string().uuid().optional(),
});

export const deckArchiveInputSchema = z.object({
  id: z.string().uuid("Mazo no encontrado"),
  isArchived: z.boolean(),
});

export const deckExportInputSchema = z.object({
  id: z.string().uuid("Mazo no encontrado"),
  format: exportFormatSchema.default("json"),
});

export const deckImportInputSchema = z.object({
  deckId: z.string().uuid("Mazo no encontrado").optional(),
  format: importFormatSchema,
  content: z.string().min(1, "El archivo está vacío").max(MAX_IMPORT_LENGTH, "El archivo es demasiado grande"),
  fileName: z.string().trim().max(200).optional(),
  duplicateStrategy: duplicateStrategySchema.default("skip"),
});

export const DUPLICATE_STRATEGY_LABELS: Record<z.infer<typeof duplicateStrategySchema>, string> = {
  skip: "Omitir",
  replace: "Reemplazar",
  copy: "Crear copia",
};