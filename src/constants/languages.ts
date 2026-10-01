export const LANGUAGE_CODES = [
  "es",
  "en",
  "ja",
  "zh",
  "ko",
  "fr",
  "de",
  "it",
  "pt",
  "ru",
  "ar",
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "en", label: "Inglés", flag: "🇬🇧" },
  { code: "ja", label: "Japonés", flag: "🇯🇵" },
  { code: "zh", label: "Chino", flag: "🇨🇳" },
  { code: "ko", label: "Coreano", flag: "🇰🇷" },
  { code: "fr", label: "Francés", flag: "🇫🇷" },
  { code: "de", label: "Alemán", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "pt", label: "Portugués", flag: "🇵🇹" },
  { code: "ru", label: "Ruso", flag: "🇷🇺" },
  { code: "ar", label: "Árabe", flag: "🇸🇦" },
];

export function isLanguageCode(value: string): value is LanguageCode {
  return (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function getLanguageLabel(code: string): string {
  return LANGUAGES.find((language) => language.code === code)?.label ?? code;
}