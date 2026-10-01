const MAX_SLUG_LENGTH = 100;

/**
 * Normaliza un texto para convertirlo en un slug URL-safe:
 * "Kanji básico 2" -> "kanji-basico-2"
 */
export function slugify(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");

  return normalized || "mazo";
}