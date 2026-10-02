import { prisma } from "@/lib/prisma";
import { protectedProcedure } from "@/server/procedures";
import {
  ensureUserLanguages,
  getOwnedLanguage,
  nextSortOrder,
  toLanguageView,
} from "@/server/languages";
import {
  languageCreateInputSchema,
  languageIdInputSchema,
  languageUpdateInputSchema,
  type LanguageCreateInput,
  type LanguageUpdateInput,
} from "@/lib/validation/language";
import type { LanguageView } from "@/types/language";

const languageSelect = {
  id: true,
  code: true,
  name: true,
  flag: true,
  sortOrder: true,
  _count: { select: { decks: true } },
} as const;

/* ------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* ------------------------------------------------------------------------- */

export async function listLanguages(userId: string): Promise<{ languages: LanguageView[] }> {
  return { languages: await ensureUserLanguages(userId) };
}

export async function createLanguage(
  userId: string,
  input: LanguageCreateInput
): Promise<{ language: LanguageView }> {
  // Se normaliza también aquí, no solo en el esquema: el handler se llama desde
  // scripts y desde el servicio, y el código es la clave única por usuario.
  const code = input.code.trim().toLowerCase();

  const existing = await prisma.language.findFirst({
    where: { userId, code },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`Ya tienes un idioma con el código "${code}"`);
  }

  const languages = await ensureUserLanguages(userId);

  const language = await prisma.language.create({
    data: {
      userId,
      code,
      name: input.name,
      flag: input.flag || null,
      sortOrder: nextSortOrder(languages),
    },
    select: languageSelect,
  });

  return { language: toLanguageView(language) };
}

export async function updateLanguage(
  userId: string,
  input: LanguageUpdateInput
): Promise<{ language: LanguageView }> {
  const current = await getOwnedLanguage(userId, input.id);

  // El código no se modifica: es la clave con la que se importan y exportan mazos.
  // La bandera sí, y una vacía se guarda como `null` en lugar de como cadena en blanco.
  const hasFlag = input.flag !== undefined;

  const language = await prisma.language.update({
    where: { id: current.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(hasFlag ? { flag: input.flag || null } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    select: languageSelect,
  });

  return { language: toLanguageView(language) };
}

export async function deleteLanguage(
  userId: string,
  input: { id: string }
): Promise<{ deleted: true }> {
  const current = await getOwnedLanguage(userId, input.id);

  // Un idioma con mazos no se borra: dejaría mazos sin idioma y el filtro de la
  // página de estudio dejaría de mostrarlos.
  if (current._count.decks > 0) {
    const decks =
      current._count.decks === 1
        ? "1 mazo lo está usando"
        : `${current._count.decks} mazos lo están usando`;

    throw new Error(`No se puede eliminar "${current.name}": ${decks}. Reasigna antes sus mazos.`);
  }

  await prisma.language.delete({ where: { id: current.id } });

  return { deleted: true };
}

/* ------------------------------------------------------------------------- */
/* Handlers de oRPC                                                          */
/* ------------------------------------------------------------------------- */

export const languagesRouter = {
  /** Catálogo de idiomas del usuario, listo para selectores y filtros. */
  list: protectedProcedure.handler(async ({ context }): Promise<{ languages: LanguageView[] }> =>
    listLanguages(context.user.id)
  ),

  create: protectedProcedure
    .input(languageCreateInputSchema)
    .handler(async ({ input, context }): Promise<{ language: LanguageView }> =>
      createLanguage(context.user.id, input)
    ),

  update: protectedProcedure
    .input(languageUpdateInputSchema)
    .handler(async ({ input, context }): Promise<{ language: LanguageView }> =>
      updateLanguage(context.user.id, input)
    ),

  remove: protectedProcedure
    .input(languageIdInputSchema)
    .handler(async ({ input, context }): Promise<{ deleted: true }> =>
      deleteLanguage(context.user.id, input)
    ),
};

export type LanguagesRouter = typeof languagesRouter;