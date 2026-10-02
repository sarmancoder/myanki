export const CSV_DELIMITER = ",";

export interface CsvRow {
  /**
   * Línea (1-indexada) del texto original donde empieza la fila. Los campos
   * entrecomillados pueden ocupar varias líneas, así que no coincide con el
   * índice de la fila dentro del array.
   */
  line: number;
  cells: string[];
}

/**
 * Tokenizador CSV conforme a RFC 4180.
 *
 * - Una coma separa campos; las comas dentro de un campo van entrecomilladas.
 * - `""` dentro de un campo entrecomillado es una comilla literal.
 * - Un campo entrecomillado puede contener saltos de línea.
 * - Una comilla solo abre un campo citado cuando es el primer carácter de ese
 *   campo, de modo que `hola "qué tal"` se lee como texto literal.
 *
 * No descarta filas vacías ni recorta campos: la numeración de líneas es
 * necesaria para informar de las filas que fallan.
 */
export function tokenizeCsv(text: string, delimiter: string = CSV_DELIMITER): CsvRow[] {
  const rows: CsvRow[] = [];

  // `\r\n` y `\r` pasan a ser un único `\n`. El reemplazo es 1:1 en número de
  // saltos de línea, así que la numeración sigue apuntando al texto original.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let cells: string[] = [];
  let field = "";
  let insideQuotes = false;
  let atFieldStart = true;
  let line = 1;
  let rowLine = 1;
  let index = 0;

  function pushCell() {
    cells.push(field);
    field = "";
    atFieldStart = true;
  }

  function pushRow() {
    pushCell();
    rows.push({ line: rowLine, cells });
    cells = [];
  }

  while (index < normalized.length) {
    const char = normalized[index];

    if (insideQuotes) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        insideQuotes = false;
        index += 1;
        continue;
      }

      if (char === "\n") {
        line += 1;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && atFieldStart) {
      insideQuotes = true;
      atFieldStart = false;
      index += 1;
      continue;
    }

    if (char === delimiter) {
      pushCell();
      index += 1;
      continue;
    }

    if (char === "\n") {
      line += 1;
      pushRow();
      rowLine = line;
      index += 1;
      continue;
    }

    field += char;
    atFieldStart = false;
    index += 1;
  }

  // Solo se añade una última fila si queda contenido sin cerrar: un `\n`
  // final no genera una fila fantasma.
  if (field.length > 0 || cells.length > 0) {
    pushRow();
  }

  return rows;
}