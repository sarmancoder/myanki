/**
 * Catálogo de referencia de idiomas.
 *
 * Los idiomas de cada usuario viven en la tabla `languages` (ver modelo `Language`)
 * y se gestionan desde Ajustes → Idiomas, así que la lista real no está cerrada en
 * el código. Lo que hay aquí son dos ayudas:
 *
 * - `SEED_LANGUAGES`: nombres y banderas conocidos, para crear idiomas nuevos a
 *   partir de un código ISO sin que el usuario tenga que escribir el nombre.
 * - `DEFAULT_LANGUAGE_CODES`: los idiomas con los que se siembra el catálogo de un
 *   usuario que todavía no tiene ninguno.
 */

export interface SeedLanguage {
  /** Código ISO 639-1 en minúsculas. */
  code: string;
  label: string;
  flag: string;
}

export const SEED_LANGUAGES: SeedLanguage[] = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "en", label: "Inglés", flag: "🇬🇧" },
  { code: "de", label: "Alemán", flag: "🇩🇪" },
  { code: "fr", label: "Francés", flag: "🇫🇷" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "pt", label: "Portugués", flag: "🇵🇹" },
  { code: "ja", label: "Japonés", flag: "🇯🇵" },
  { code: "zh", label: "Chino", flag: "🇨🇳" },
  { code: "ko", label: "Coreano", flag: "🇰🇷" },
  { code: "ru", label: "Ruso", flag: "🇷🇺" },
  { code: "ar", label: "Árabe", flag: "🇸🇦" },
];

/** Idiomas con los que se siembra el catálogo de un usuario nuevo. */
export const DEFAULT_LANGUAGE_CODES = ["es", "en"] as const;

export function findSeedLanguage(code: string): SeedLanguage | null {
  return SEED_LANGUAGES.find((language) => language.code === code) ?? null;
}

/** Nombre a mostrar para un código que puede no estar en el catálogo de referencia. */
export function getSeedLanguageLabel(code: string): string {
  return findSeedLanguage(code)?.label ?? code.toUpperCase();
}