import { tokenizeCsv } from "@/lib/csv";
import { MAX_BATCH_CARDS, MAX_CARD_SIDE_LENGTH } from "@/lib/validation/card";

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
  /** Filas vacías o la cabecera opcional que se ignoraron sin error. */
  ignored: number;
}

/** Cabeceras aceptadas en la primera fila, en el orden en que se espera. */
const HEADER_ALIASES = [
  ["anverso", "reverso"],
  ["front", "back"],
];

/** Compara cabeceras sin distinguir acentos, mayúsculas ni espacios sobrantes. */
function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isHeaderRow(cells: string[]): boolean {
  if (cells.length !== 2) {
    return false;
  }

  return HEADER_ALIASES.some(
    ([first, second]) => normalizeHeader(cells[0]) === first && normalizeHeader(cells[1]) === second
  );
}

/** Corta un campo que supera el máximo sin partir palabras. */
function truncate(value: string): string {
  if (value.length <= MAX_CARD_SIDE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_CARD_SIDE_LENGTH - 1)}…`;
}

/**
 * Convierte el texto pegado por el usuario en tarjetas.
 *
 * El formato es CSV (RFC 4180) con una tarjeta por fila:
 *
 * - `anverso,reverso`.
 * - Una cabecera `anverso,reverso` (o `front,back`) es opcional y solo se
 *   reconoce en la primera fila con datos.
 * - Las comas, comillas dobles y saltos de línea del contenido van entrecomillados.
 * - Las filas en blanco se ignoran.
 * - No se sobrepasa {@link MAX_BATCH_CARDS}; el resto de filas se reportan.
 */
export function parseBatchCards(content: string): BatchParseResult {
  const cards: BatchCardDraft[] = [];
  const failures: BatchParseFailure[] = [];
  let ignored = 0;
  let isFirstDataRow = true;

  const rows = tokenizeCsv(content);

  for (const row of rows) {
    if (row.cells.every((cell) => cell.trim().length === 0)) {
      ignored += 1;
      continue;
    }

    // La cabecera solo cuenta si es la primera fila con datos: así unas líneas
    // en blanco al principio no descolocan la detección.
    if (isFirstDataRow) {
      isFirstDataRow = false;

      if (isHeaderRow(row.cells)) {
        ignored += 1;
        continue;
      }
    }

    if (cards.length >= MAX_BATCH_CARDS) {
      failures.push({
        line: row.line,
        message: `Se alcanzó el máximo de ${MAX_BATCH_CARDS} tarjetas por importación`,
      });
      continue;
    }

    if (row.cells.length < 2) {
      failures.push({
        line: row.line,
        message: 'Falta la coma que separa anverso y reverso (ej. "bonjour,hola")',
      });
      continue;
    }

    if (row.cells.length > 2) {
      failures.push({
        line: row.line,
        message: `La fila tiene ${row.cells.length} columnas y se esperan 2. Entrecomilla las comas del contenido, p. ej. "voir, comprendre",comprender`,
      });
      continue;
    }

    const front = (row.cells[0] ?? "").trim();
    const back = (row.cells[1] ?? "").trim();

    if (front.length === 0) {
      failures.push({ line: row.line, message: "El anverso está vacío" });
      continue;
    }

    cards.push({ front: truncate(front), back: truncate(back) });
  }

  return { cards, failures, ignored };
}