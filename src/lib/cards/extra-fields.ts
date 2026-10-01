import { Prisma } from "@prisma/client";
import type { CardExtraFields } from "@/types/card";

type Json = Prisma.JsonValue;

/**
 * Los campos personalizados se guardan en una columna JSONB. Al leerlos se
 * descarta cualquier cosa que no sea un par texto/texto (por ejemplo, datos
 * escritos por una importación antigua) para que la UI nunca reciba `null`,
 * números u objetos anidados.
 */
export function normalizeExtraFields(value: unknown): CardExtraFields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const fields: CardExtraFields = {};

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = key.trim();

    if (name.length === 0) {
      continue;
    }

    const text = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();

    if (text.length === 0) {
      continue;
    }

    fields[name] = text;
  }

  return fields;
}

/** Convierte los pares `[nombre, valor]` del formulario en el objeto JSONB. */
export function extraFieldsToJson(
  pairs: { key: string; value: string }[]
): Prisma.InputJsonObject {
  // `InputJsonObject` no admite index signatures mutables, así que se construye
  // con un `Record<string, string>` y se tipa al final.
  const json: Record<string, string> = {};

  for (const pair of pairs) {
    const name = pair.key.trim();
    const value = pair.value.trim();

    if (name.length === 0 || value.length === 0) {
      continue;
    }

    json[name] = value;
  }

  return json as Prisma.InputJsonObject;
}

/** Orden estable y predecible para mostrar los campos personalizados. */
export function sortExtraFields(fields: CardExtraFields): [string, string][] {
  return Object.entries(fields).sort(([a], [b]) => a.localeCompare(b, "es"));
}

export function isPlainJsonObject(value: Json | undefined): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}