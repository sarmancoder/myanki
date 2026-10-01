import { MAX_BATCH_CARDS, MAX_CARD_SIDE_LENGTH } from "@/lib/validation/card";

/**
 * Separador principal (un tabulador, como en Anki) y alternativa legible cuando
 * se pega texto desde un editor o una hoja de cálculo: flecha rodeada de
 * espacios. Se elige el tabulador si la línea lo contiene.
 */
const ARROW_SEPARATOR = " -> ";

export interface BatchCardDraft {
  front: string;
  back: string;
}

export interface BatchParseFailure {
  /** Número de línea (1-indexado) tal y como aparece en el textarea. */
  line: number;
  message: string;
}

export interface BatchParseResult {
  cards: BatchCardDraft[];
  failures: BatchParseFailure[];
  /** Líneas vacías o comentadas que se ignoraron sin error. */
  ignored: number;
}

/** Corta un campo que supera el máximo sin partir palabras. */
function truncate(value: string): string {
  if (value.length <= MAX_CARD_SIDE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_CARD_SIDE_LENGTH - 1)}…`;
}

function splitLine(line: string): [string, string] | null {
  const tabIndex = line.indexOf("\t");

  if (tabIndex >= 0) {
    return [line.slice(0, tabIndex), line.slice(tabIndex + 1)];
  }

  const arrowIndex = line.indexOf(ARROW_SEPARATOR);

  if (arrowIndex >= 0) {
    return [line.slice(0, arrowIndex), line.slice(arrowIndex + ARROW_SEPARATOR.length)];
  }

  return null;
}

/**
 * Convierte el texto pegado por el usuario en tarjetas.
 *
 * - Una tarjeta por línea.
 * - `anverso<TAB>reverso` o `anverso -> reverso`.
 * - Las líneas en blanco y las que empiezan por `#` se ignoran (comentarios).
 * - No se sobrepasa {@link MAX_BATCH_CARDS}; el resto de líneas se reportan.
 */
export function parseBatchCards(content: string): BatchParseResult {
  const cards: BatchCardDraft[] = [];
  const failures: BatchParseFailure[] = [];
  let ignored = 0;

  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];

    if (rawLine === undefined) {
      continue;
    }

    const lineNumber = index + 1;

    // Se eliminan solo los espacios finales: los iniciales conservan la
    // indentación de las listas Markdown.
    const line = rawLine.replace(/\s+$/, "");

    if (line.trim().length === 0 || line.trim().startsWith("#")) {
      ignored += 1;
      continue;
    }

    if (cards.length >= MAX_BATCH_CARDS) {
      failures.push({
        line: lineNumber,
        message: `Se alcanzó el máximo de ${MAX_BATCH_CARDS} tarjetas por importación`,
      });
      continue;
    }

    const parts = splitLine(line);

    if (!parts) {
      failures.push({
        line: lineNumber,
        message: "Falta el separador entre anverso y reverso (usa un tabulador o « -> »)",
      });
      continue;
    }

    const front = parts[0].trim();
    const back = parts[1].trim();

    if (front.length === 0) {
      failures.push({ line: lineNumber, message: "El anverso está vacío" });
      continue;
    }

    cards.push({ front: truncate(front), back: truncate(back) });
  }

  return { cards, failures, ignored };
}