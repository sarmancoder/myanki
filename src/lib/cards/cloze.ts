/**
 * Utilidades para tarjetas de tipo "cloze".
 *
 * Sintaxis soportada (compatible con Anki):
 *   {{c1::texto oculto}}            → borrado simple
 *   {{c2::texto::pista}}            → borrado con pista
 *   {{c3::texto}}                   → el índice no tiene que ser correlativo
 */

/** Captura el índice, el texto del borrado y la pista opcional. */
const CLOZE_PATTERN = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export interface ClozeDeletion {
  /** Índice tal y como aparece en la tarjeta (1, 2, 3...). */
  index: number;
  /** Texto que se oculta al estudiar. */
  text: string;
  /** Pista mostrada en el anverso, si la hay. */
  hint: string | null;
}

export function parseClozeDeletions(text: string): ClozeDeletion[] {
  const deletions: ClozeDeletion[] = [];

  CLOZE_PATTERN.lastIndex = 0;

  let match = CLOZE_PATTERN.exec(text);

  while (match !== null) {
    const index = Number.parseInt(match[1], 10);
    const body = match[2] ?? "";
    const hint = match[3]?.trim();

    // `{{c2::}}` no oculta nada: se trata como texto plano.
    if (Number.isFinite(index) && index > 0 && body.trim().length > 0) {
      deletions.push({ index, text: body, hint: hint && hint.length > 0 ? hint : null });
    }

    match = CLOZE_PATTERN.exec(text);
  }

  return deletions;
}

export function hasCloze(text: string): boolean {
  return parseClozeDeletions(text).length > 0;
}

/** Índices de borrado distintos presentes en la tarjeta, ordenados de menor a mayor. */
export function listClozeIndexes(text: string): number[] {
  const indexes = new Set(parseClozeDeletions(text).map((deletion) => deletion.index));

  return [...indexes].sort((a, b) => a - b);
}

export type ClozePreviewPart =
  | { kind: "text"; value: string }
  | { kind: "deletion"; value: string; hint: string | null; index: number };

/**
 * Divide el texto en tramos normales y borrados, para poder pintar el anverso
 * con los huecos Tapizados en el listado y en la vista previa del editor.
 */
export function splitCloze(text: string): ClozePreviewPart[] {
  const parts: ClozePreviewPart[] = [];
  let cursor = 0;

  CLOZE_PATTERN.lastIndex = 0;

  let match = CLOZE_PATTERN.exec(text);

  while (match !== null) {
    const index = Number.parseInt(match[1], 10);
    const body = match[2] ?? "";
    const hint = match[3]?.trim();

    if (Number.isFinite(index) && index > 0 && body.trim().length > 0) {
      if (match.index > cursor) {
        parts.push({ kind: "text", value: text.slice(cursor, match.index) });
      }

      parts.push({
        kind: "deletion",
        value: body,
        hint: hint && hint.length > 0 ? hint : null,
        index,
      });

      cursor = match.index + match[0].length;
    }

    match = CLOZE_PATTERN.exec(text);
  }

  if (cursor < text.length) {
    parts.push({ kind: "text", value: text.slice(cursor) });
  }

  return parts;
}

/** Anverso tal y como se ve al estudiar: todos los huecos ocultos. */
export function hideClozeDeletions(text: string, placeholder = "[...]"): string {
  return splitCloze(text)
    .map((part) => (part.kind === "deletion" ? placeholder : part.value))
    .join("");
}

/**
 * Texto plano sin sintaxis Markdown ni marcadores de cloze. Se usa para el
 * buscador y para los fragmentos que se muestran en el listado.
 */
export function toPlainText(text: string): string {
  return text
    .replace(CLOZE_PATTERN, (_match, _index: string, body: string) => body)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}