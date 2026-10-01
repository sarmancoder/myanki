import { z } from "zod";
import { isLanguageCode, type LanguageCode } from "@/constants/languages";
import { MAX_DECK_NAME_LENGTH } from "@/lib/validation/deck";

export const EXPORT_CSV_HEADERS = [
  "deckPath",
  "front",
  "back",
  "cardType",
  "imageUrl",
  "audioUrl",
  "colorTag",
  "isSuspended",
] as const;

export interface TransferCard {
  front: string;
  back: string;
  cardType: string;
  imageUrl: string | null;
  audioUrl: string | null;
  colorTag: string | null;
  isSuspended: boolean;
}

export interface TransferDeck {
  name: string;
  slug?: string | null;
  description?: string | null;
  languageCode?: string | null;
  isArchived?: boolean;
  cards: TransferCard[];
  subdecks: TransferDeck[];
}

export interface JsonExportPayload {
  version: 1;
  exportedAt: string;
  deck: TransferDeck;
}

export class DeckTransferError extends Error {
  details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "DeckTransferError";
    this.details = details;
  }
}

const importedCardSchema = z.object({
  front: z.string().trim().min(1, "el anverso está vacío").max(2000, "el anverso es demasiado largo"),
  back: z.string().trim().min(1, "el reverso está vacío").max(5000, "el reverso es demasiado largo"),
  cardType: z.string().trim().max(50).optional(),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  audioUrl: z.string().trim().max(500).optional().nullable(),
  colorTag: z.string().trim().max(20).optional().nullable(),
  isSuspended: z.boolean().optional(),
});

function normalizeCard(raw: unknown, location: string): TransferCard {
  const parsed = importedCardSchema.safeParse(raw);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${location}: ${issue.path.join(".")} - ${issue.message}`)
      .join("; ");

    throw new DeckTransferError("El archivo contiene tarjetas inválidas", [problems]);
  }

  return {
    front: parsed.data.front,
    back: parsed.data.back,
    cardType: parsed.data.cardType && parsed.data.cardType.length > 0 ? parsed.data.cardType : "basic",
    imageUrl: parsed.data.imageUrl || null,
    audioUrl: parsed.data.audioUrl || null,
    colorTag: parsed.data.colorTag || null,
    isSuspended: parsed.data.isSuspended ?? false,
  };
}

export function serializeJson(payload: JsonExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Evita que Excel/Sheets interpreten fórmulas al abrir el CSV exportado. */
function sanitizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = sanitizeCell(String(value));

  if (/[",\n\r;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export interface CsvExportRow {
  deckPath: string;
  card: TransferCard;
}

export function serializeCsv(rows: CsvExportRow[]): string {
  const lines = [EXPORT_CSV_HEADERS.join(",")];

  for (const { deckPath, card } of rows) {
    lines.push(
      [
        csvCell(deckPath),
        csvCell(card.front),
        csvCell(card.back),
        csvCell(card.cardType),
        csvCell(card.imageUrl),
        csvCell(card.audioUrl),
        csvCell(card.colorTag),
        csvCell(card.isSuspended),
      ].join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

/** Aplana un mazo exportado (incluidos sub-mazos) a filas CSV con su ruta. */
export function flattenTransferDeck(deck: TransferDeck, parentPath: string[] = []): CsvExportRow[] {
  const path = [...parentPath, deck.name];

  return [
    ...deck.cards.map((card) => ({ deckPath: path.join(" / "), card })),
    ...deck.subdecks.flatMap((subdeck) => flattenTransferDeck(subdeck, path)),
  ];
}

/** Parser CSV mínimo compatible con RFC 4180 (comillas dobles y saltos de línea). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let insideQuotes = false;
  let index = 0;

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

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

      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

function rowToObject(headers: string[], values: string[]): Record<string, string> {
  const entry: Record<string, string> = {};

  headers.forEach((header, position) => {
    const raw = (values[position] ?? "").trim();

    // Deshace el escape de fórmulas aplicado al exportar (`'=1` -> `=1`).
    entry[header.trim().toLowerCase()] = raw.replace(/^'(?=[=+\-@])/, "");
  });

  return entry;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase();

  if (["true", "1", "yes", "si", "sí"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no"].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function parseCsvImport(text: string): { cards: TransferCard[] } {
  const rows = parseCsvRows(text);

  if (rows.length === 0) {
    throw new DeckTransferError("El archivo CSV está vacío");
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());

  if (!headers.includes("front") || !headers.includes("back")) {
    throw new DeckTransferError(
      "El CSV debe incluir las columnas 'front' (anverso) y 'back' (reverso)"
    );
  }

  const cards: TransferCard[] = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const entry = rowToObject(headers, rows[rowIndex]);

    cards.push(
      normalizeCard(
        {
          front: entry.front,
          back: entry.back,
          cardType: entry.cardtype,
          imageUrl: entry.imageurl,
          audioUrl: entry.audiourl,
          colorTag: entry.colortag,
          isSuspended: parseBoolean(entry.issuspended),
        },
        `fila ${rowIndex + 1}`
      )
    );
  }

  if (cards.length === 0) {
    throw new DeckTransferError("El archivo no contiene tarjetas");
  }

  return { cards };
}

function readDeckNode(raw: unknown, location: string): TransferDeck {
  if (typeof raw !== "object" || raw === null) {
    throw new DeckTransferError("El archivo JSON no tiene el formato esperado", [
      `${location}: se esperaba un objeto`,
    ]);
  }

  const node = raw as Record<string, unknown>;
  const name = typeof node.name === "string" ? node.name.trim() : "";
  const rawCards = Array.isArray(node.cards) ? node.cards : [];
  const rawSubdecks = Array.isArray(node.subdecks)
    ? node.subdecks
    : Array.isArray(node.subDecks)
      ? node.subDecks
      : [];

  return {
    name: name.slice(0, MAX_DECK_NAME_LENGTH),
    slug: typeof node.slug === "string" ? node.slug : null,
    description: typeof node.description === "string" ? node.description : null,
    languageCode: typeof node.languageCode === "string" ? node.languageCode : null,
    isArchived: typeof node.isArchived === "boolean" ? node.isArchived : false,
    cards: rawCards.map((card, index) => normalizeCard(card, `tarjeta ${index + 1}`)),
    subdecks: rawSubdecks.map((subdeck, index) => readDeckNode(subdeck, `sub-mazo ${index + 1}`)),
  };
}

export interface JsonImportPayload {
  name: string | null;
  description: string | null;
  languageCode: LanguageCode | null;
  cards: TransferCard[];
}

export function parseJsonImport(text: string): JsonImportPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DeckTransferError("El archivo JSON no es válido");
  }

  const root = parsed as Record<string, unknown> | unknown[];

  if (Array.isArray(root)) {
    return {
      name: null,
      description: null,
      languageCode: null,
      cards: root.map((card, index) => normalizeCard(card, `tarjeta ${index + 1}`)),
    };
  }

  if (typeof root !== "object" || root === null) {
    throw new DeckTransferError("El archivo JSON no tiene el formato esperado");
  }

  const deckNode = root.deck ?? root;

  if (typeof deckNode !== "object" || deckNode === null) {
    throw new DeckTransferError("El archivo JSON no contiene ningún mazo");
  }

  const deck = readDeckNode(deckNode, "mazo");
  const cards = Array.isArray(root.cards) ? root.cards.map((card, index) => normalizeCard(card, `tarjeta ${index + 1}`)) : deck.cards;

  if (cards.length === 0 && deck.subdecks.length === 0) {
    throw new DeckTransferError("El archivo no contiene tarjetas");
  }

  const languageCode =
    deck.languageCode && isLanguageCode(deck.languageCode) ? deck.languageCode : null;

  return {
    name: deck.name.length > 0 ? deck.name : null,
    description: deck.description ?? null,
    languageCode,
    cards,
  };
}