"use client";

import { usePathname, useRouter } from "next/navigation";
import { formatNumber } from "@/lib/format";
import type { StudyLanguageFilter } from "@/types/study";

interface StudyLanguageFilterBarProps {
  languages: StudyLanguageFilter[];
  activeLanguageId: string | null;
  /** Tarjetas de todos los mazos, sin filtrar, para el chip "Todos". */
  totalCards: number;
}

const CHIP_CLASS =
  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors";
const CHIP_ACTIVE_CLASS = "border-primary bg-secondary text-primary";
const CHIP_IDLE_CLASS = "border-border text-secondary-foreground hover:bg-secondary";

/**
 * Filtro de idiomas del panel de estudio: cada chip lleva el número de mazos y
 * tarjetas de su idioma, y el estado vive en la URL (`?lang=<id>`).
 */
export default function StudyLanguageFilterBar({
  languages,
  activeLanguageId,
  totalCards,
}: StudyLanguageFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  function selectLanguage(languageId: string | null) {
    router.replace(languageId ? `${pathname}?lang=${languageId}` : pathname);
  }

  if (languages.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-lg border border-border bg-background p-4"
      aria-label="Filtrar mazos por idioma"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-secondary-foreground">Idioma</span>

        <button
          type="button"
          onClick={() => selectLanguage(null)}
          aria-pressed={activeLanguageId === null}
          className={`${CHIP_CLASS} ${
            activeLanguageId === null ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS
          }`}
        >
          Todos · {formatNumber(totalCards)}
        </button>

        {languages.map((language) => (
          <button
            key={language.id}
            type="button"
            onClick={() => selectLanguage(language.id)}
            aria-pressed={activeLanguageId === language.id}
            title={`${language.deckCount} ${language.deckCount === 1 ? "mazo" : "mazos"} · ${formatNumber(
              language.cardCount
            )} tarjetas`}
            className={`${CHIP_CLASS} ${
              activeLanguageId === language.id ? CHIP_ACTIVE_CLASS : CHIP_IDLE_CLASS
            }`}
          >
            {language.flag ? `${language.flag} ` : ""}
            {language.name} · {formatNumber(language.cardCount)}
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-secondary-foreground">
        Los mazos se filtran por el idioma con el que los creaste. Puedes añadir más en Ajustes →
        Idiomas.
      </p>
    </section>
  );
}