import { prisma } from "@/lib/prisma";
import { DEFAULT_LANGUAGE_CODES, findSeedLanguage } from "@/constants/languages";
import type { LanguageView } from "@/types/language";

/**
 * Servicio de catálogo de idiomas.
 *
 * Vive fuera del router porque lo necesitan varios routers (mazos y estudio) y
 * porque los scripts de comprobación lo usan sin levantar el contexto de
 * autenticación de Next.js.
 */

const languageSelect = {
  id: true,
  code: true,
  name: true,
  flag: true,
  sortOrder: true,
  _count: { select: { decks: true } },
} as const;

type LanguageRow = {
  id: string;
  code: string;
  name: string;
  flag: string | null;
  sortOrder: number;
  _count: { decks: number };
};

export function toLanguageView(row: LanguageRow): LanguageView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    flag: row.flag,
    sortOrder: row.sortOrder,
    deckCount: row._count.decks,
  };
}

/** Idiomas con los que se siembra el catálogo de un usuario que no tiene ninguno. */
function defaultLanguageSeed() {
  return DEFAULT_LANGUAGE_CODES.map((code) => {
    const seed = findSeedLanguage(code);

    return { code, name: seed?.label ?? code.toUpperCase(), flag: seed?.flag ?? null };
  });
}

/**
 * Devuelve el catálogo del usuario y, si está vacío, lo siembra con los idiomas
 * por defecto.
 *
 * Es idempotente y se llama también desde las lecturas: una cuenta creada antes de
 * que existiera la tabla no puede quedarse sin opciones en los selectores.
 */
export async function ensureUserLanguages(userId: string): Promise<LanguageView[]> {
  const existing = await prisma.language.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: languageSelect,
  });

  if (existing.length > 0) {
    return existing.map(toLanguageView);
  }

  const seeds = defaultLanguageSeed();

  const created = await prisma.$transaction(
    seeds.map((seed, sortOrder) =>
      prisma.language.create({
        data: { userId, ...seed, sortOrder },
        select: languageSelect,
      })
    )
  );

  return created.map(toLanguageView);
}

/**
 * Resuelve el idioma de un mazo a partir de lo enviado por el formulario: el
 * elegido, el del mazo padre o el primero del catálogo. Los ids que no son del
 * usuario se descartan para no poder colgar un mazo de un idioma ajeno.
 */
export async function resolveDeckLanguageId(
  userId: string,
  languageId: string | undefined,
  parentLanguageId: string | null
): Promise<string | null> {
  const languages = await ensureUserLanguages(userId);
  const available = new Set(languages.map((language) => language.id));

  if (languageId && available.has(languageId)) {
    return languageId;
  }

  if (parentLanguageId && available.has(parentLanguageId)) {
    return parentLanguageId;
  }

  return languages[0]?.id ?? null;
}

/**
 * Busca un idioma por código y lo crea si el usuario no lo tenía. Se usa al
 * importar mazos: el archivo trae el código ISO y el usuario decide después cómo
 * llamarlo.
 */
export async function resolveLanguageIdByCode(userId: string, code: string): Promise<string> {
  const normalized = code.trim().toLowerCase();

  const existing = await prisma.language.findFirst({
    where: { userId, code: normalized },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  const seed = findSeedLanguage(normalized);
  const languages = await ensureUserLanguages(userId);
  const nextSortOrder =
    languages.reduce((max, language) => Math.max(max, language.sortOrder), -1) + 1;

  const created = await prisma.language.create({
    data: {
      userId,
      code: normalized,
      name: seed?.label ?? normalized.toUpperCase(),
      flag: seed?.flag ?? null,
      sortOrder: nextSortOrder,
    },
    select: { id: true },
  });

  return created.id;
}

export async function getOwnedLanguage(userId: string, languageId: string): Promise<LanguageRow> {
  const language = await prisma.language.findFirst({
    where: { id: languageId, userId },
    select: languageSelect,
  });

  if (!language) {
    throw new Error("El idioma no existe");
  }

  return language;
}

/** Siguiente posición libre del catálogo, para dejar los idiomas nuevos al final. */
export function nextSortOrder(languages: LanguageView[]): number {
  return languages.reduce((max, language) => Math.max(max, language.sortOrder), -1) + 1;
}