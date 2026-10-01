import { z } from "zod";
import { CARD_COLOR_TAGS, CARD_STATUS_FILTERS, CARD_TYPES } from "@/constants/cards";
import { MAX_IMPORT_LENGTH } from "@/lib/validation/deck";

export const MAX_CARD_SIDE_LENGTH = 20_000;
export const MAX_EXTRA_FIELDS = 10;
export const MAX_EXTRA_FIELD_KEY_LENGTH = 40;
export const MAX_EXTRA_FIELD_VALUE_LENGTH = 5_000;
export const MAX_BATCH_CARDS = 500;
export const MAX_SEARCH_LENGTH = 100;
export const CARD_PAGE_SIZE = 20;
export const CARD_PAGE_SIZES = [20, 50, 100] as const;
export const MAX_MEDIA_URL_LENGTH = 500;

export const cardTypeSchema = z.enum(CARD_TYPES, { error: "Selecciona un tipo de tarjeta válido" });

export const cardColorTagSchema = z.enum(CARD_COLOR_TAGS);

export const cardSideSchema = z
  .string()
  .trim()
  .min(1, "El anverso no puede estar vacío")
  .max(MAX_CARD_SIDE_LENGTH, `El contenido supera los ${MAX_CARD_SIDE_LENGTH} caracteres`);

export const cardBackSchema = z
  .string()
  .trim()
  .max(MAX_CARD_SIDE_LENGTH, `El contenido supera los ${MAX_CARD_SIDE_LENGTH} caracteres`);

/** URL local (`/uploads/...`) o externa (http/https). */
export const mediaUrlSchema = z
  .string()
  .trim()
  .max(MAX_MEDIA_URL_LENGTH, "La URL del archivo es demasiado larga")
  .refine(
    (value) => value.startsWith("/uploads/") || /^https?:\/\//i.test(value),
    "La URL del archivo no es válida"
  );

const extraFieldKeySchema = z
  .string()
  .trim()
  .min(1, "El nombre del campo no puede estar vacío")
  .max(MAX_EXTRA_FIELD_KEY_LENGTH, `El nombre del campo no puede superar los ${MAX_EXTRA_FIELD_KEY_LENGTH} caracteres`);

const extraFieldValueSchema = z
  .string()
  .trim()
  .max(MAX_EXTRA_FIELD_VALUE_LENGTH, `El valor del campo no puede superar los ${MAX_EXTRA_FIELD_VALUE_LENGTH} caracteres`);

/**
 * Los campos personalizados llegan como pares `[nombre, valor]`. El array se usa
 * en lugar de un objeto para que Zod pueda reportar el índice exacto de la fila
 * que falla y para poder rechazar nombres duplicados.
 */
export const cardExtraFieldsSchema = z
  .array(
    z.object({
      key: extraFieldKeySchema,
      value: extraFieldValueSchema,
    })
  )
  .max(MAX_EXTRA_FIELDS, `No se admiten más de ${MAX_EXTRA_FIELDS} campos personalizados`)
  .refine(
    (fields) => {
      const keys = fields.map((field) => field.key.toLowerCase());

      return new Set(keys).size === keys.length;
    },
    { error: "Hay campos personalizados con el mismo nombre" }
  )
  .refine((fields) => fields.every((field) => field.value.length > 0), {
    error: "Los campos personalizados con nombre deben tener valor (o borra la fila)",
  });

export const cardIdSchema = z.string().uuid("Tarjeta no encontrada");

export const cardIdInputSchema = z.object({
  id: cardIdSchema,
});

export const cardIdsSchema = z
  .array(cardIdSchema)
  .min(1, "Selecciona al menos una tarjeta")
  .max(500, "Selecciona como máximo 500 tarjetas a la vez");

export const cardListInputSchema = z.object({
  deckId: z.string().uuid("Mazo no encontrado"),
  search: z.string().trim().max(MAX_SEARCH_LENGTH, "La búsqueda es demasiado larga").optional(),
  status: z.enum(CARD_STATUS_FILTERS).default("all"),
  sort: z.enum(["createdAt", "front", "interval"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) => (CARD_PAGE_SIZES as readonly number[]).includes(value), {
      error: "Tamaño de página no válido",
    })
    .default(CARD_PAGE_SIZE),
});

export const cardCreateInputSchema = z.object({
  deckId: z.string().uuid("Mazo no encontrado"),
  cardType: cardTypeSchema.default("basic"),
  front: cardSideSchema,
  back: cardBackSchema.default(""),
  extraFields: cardExtraFieldsSchema.default([]),
  imageUrl: mediaUrlSchema.nullish(),
  audioUrl: mediaUrlSchema.nullish(),
  colorTag: cardColorTagSchema.nullish(),
  isSuspended: z.boolean().default(false),
});

export const cardBatchCreateInputSchema = z.object({
  deckId: z.string().uuid("Mazo no encontrado"),
  content: z
    .string()
    .min(1, "Escribe al menos una tarjeta")
    .max(MAX_IMPORT_LENGTH, "El contenido es demasiado largo"),
  cardType: cardTypeSchema.default("basic"),
  colorTag: cardColorTagSchema.nullish(),
});

export const cardUpdateInputSchema = z.object({
  id: cardIdSchema,
  cardType: cardTypeSchema.optional(),
  front: cardSideSchema.optional(),
  back: cardBackSchema.optional(),
  extraFields: cardExtraFieldsSchema.optional(),
  imageUrl: mediaUrlSchema.nullable().optional(),
  audioUrl: mediaUrlSchema.nullable().optional(),
  colorTag: cardColorTagSchema.nullable().optional(),
  isSuspended: z.boolean().optional(),
  deckId: z.string().uuid("Mazo no encontrado").optional(),
});

export const cardDeleteInputSchema = cardIdInputSchema;

export const cardBatchDeleteInputSchema = z.object({
  ids: cardIdsSchema,
});

export const cardSuspendInputSchema = z.object({
  ids: cardIdsSchema,
  isSuspended: z.boolean(),
});

export const cardMoveInputSchema = z.object({
  ids: cardIdsSchema,
  deckId: z.string().uuid("Mazo no encontrado"),
});

export const mediaUploadInputSchema = z.object({
  kind: z.enum(["image", "audio"], { error: "Tipo de archivo no válido" }),
  /** Archivo codificado en base64 (sin la cabecera `data:...;base64,`). */
  base64: z.string().min(1, "El archivo está vacío"),
  /** MIME type detectado en el cliente; el servidor lo contrasta con su lista blanca. */
  mimeType: z.string().trim().min(1, "Tipo de archivo desconocido").max(120),
});