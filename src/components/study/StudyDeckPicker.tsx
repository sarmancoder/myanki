import Link from "next/link";
import { formatDate, formatNumber } from "@/lib/format";
import type { StudyDeckOption, StudyLanguageFilter } from "@/types/study";

interface StudyDeckPickerProps {
  decks: StudyDeckOption[];
  /** Catálogo con el peso de cada idioma, para el filtro de la cabecera. */
  languages: StudyLanguageFilter[];
  activeLanguageId: string | null;
}

/** Tarjeta del selector: nombre, cuántas tarjetas tiene y cuándo se estudió. */
function DeckEntry({ deck }: { deck: StudyDeckOption }) {
  return (
    <li>
      <Link
        href={`/study/deck/${deck.slug}`}
        className="flex h-full flex-col justify-between gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-primary hover:bg-secondary/40"
      >
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <span
              className="font-semibold text-primary"
              style={{ paddingLeft: `${(deck.depth - 1) * 0.75}rem` }}
            >
              {deck.name}
            </span>
            {deck.language && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {deck.language.flag ? `${deck.language.flag} ` : ""}
                {deck.language.name}
              </span>
            )}
            {deck.isArchived && (
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-medium text-yellow-700">
                Archivado
              </span>
            )}
          </p>
          <p className="text-xs text-secondary-foreground">
            {formatNumber(deck.totalCards)} tarjeta{deck.totalCards === 1 ? "" : "s"} ·{" "}
            {formatNumber(deck.counts.new)} nueva{deck.counts.new === 1 ? "" : "s"} ·{" "}
            {formatNumber(deck.counts.learning)} en aprendizaje ·{" "}
            {formatNumber(deck.counts.review)} aprendida{deck.counts.review === 1 ? "" : "s"}
          </p>
        </div>

        <p className="flex items-center justify-between gap-2 text-xs text-secondary-foreground">
          <span>
            {deck.lastStudiedAt ? `Último estudio: ${formatDate(deck.lastStudiedAt)}` : "Sin estudiar todavía"}
          </span>
          <span className="font-medium text-primary">Estudiar →</span>
        </p>
      </Link>
    </li>
  );
}

/**
 * Selector de mazos del panel de estudio (RF-024): al elegir uno se abre su
 * pantalla, con el listado completo de tarjetas y el botón de estudiar.
 */
export default function StudyDeckPicker({
  decks,
  languages,
  activeLanguageId,
}: StudyDeckPickerProps) {
  const activeLanguage = languages.find((language) => language.id === activeLanguageId) ?? null;

  if (decks.length === 0) {
    // Con un idioma activo la lista vacía significa "no tienes mazos de ese idioma",
    // no que no tengas mazos: el mensaje tiene que distinguir los dos casos.
    return (
      <section className="rounded-lg border border-dashed border-border bg-background p-8 text-center">
        <h2 className="text-sm font-semibold text-primary">
          {activeLanguage
            ? `No tienes mazos en ${activeLanguage.flag ? `${activeLanguage.flag} ` : ""}${
                activeLanguage.name
              }`
            : "Todavía no tienes mazos"}
        </h2>
        <p className="mt-1 text-sm text-secondary-foreground">
          {activeLanguage
            ? "Cambia de idioma en el filtro de arriba o crea un mazo nuevo para este."
            : "Crea un mazo y añade tarjetas para poder estudiarlas."}
        </p>
        <Link
          href="/decks/new"
          className="mt-4 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Crear un mazo
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-primary">Elige un mazo para estudiar</h2>
        {activeLanguage && (
          <p className="text-xs text-secondary-foreground">
            {decks.length} mazo{decks.length === 1 ? "" : "s"} en{" "}
            <strong className="font-medium text-primary">{activeLanguage.name}</strong>
          </p>
        )}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {decks.map((deck) => (
          <DeckEntry key={deck.id} deck={deck} />
        ))}
      </ul>
    </section>
  );
}