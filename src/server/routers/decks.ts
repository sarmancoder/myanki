import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { protectedProcedure } from "@/server/procedures";
import { slugify } from "@/lib/slug";
import { isLanguageCode, type LanguageCode } from "@/constants/languages";
import {
  MAX_DECK_DEPTH,
  deckArchiveInputSchema,
  deckCreateInputSchema,
  deckExportInputSchema,
  deckIdInputSchema,
  deckImportInputSchema,
  deckListInputSchema,
  deckOptionsInputSchema,
  deckSlugInputSchema,
  deckUpdateInputSchema,
} from "@/lib/validation/deck";
import {
  EMPTY_STATS,
  buildDeckTree,
  collectDeckBranchIds,
  computeDeckDepths,
  filterDeckTree,
  flattenDeckTree,
  sortDeckTree,
  toDeckSummary,
} from "@/lib/decks/tree";
import {
  DeckTransferError,
  flattenTransferDeck,
  parseCsvImport,
  parseJsonImport,
  serializeCsv,
  serializeJson,
  type JsonExportPayload,
  type TransferCard,
  type TransferDeck,
} from "@/lib/decks/transfer";
import type {
  DeckDeleteImpact,
  DeckDetailResult,
  DeckListResult,
  DeckNode,
  DeckOption,
  DeckStatsView,
  DeckSummary,
  ImportResult,
} from "@/types/deck";

const MAX_SLUG_ATTEMPTS = 100;

const deckSelect = {
  id: true,
  parentDeckId: true,
  name: true,
  slug: true,
  description: true,
  languageCode: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
  lastStudiedAt: true,
} satisfies Prisma.DeckSelect;

type DeckRow = Prisma.DeckGetPayload<{ select: typeof deckSelect }>;

function endOfTodayUtc(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  );
}

async function loadDeckRows(userId: string): Promise<DeckRow[]> {
  return prisma.deck.findMany({
    where: { userId },
    select: deckSelect,
  });
}

/**
 * Estadísticas calculadas al vuelo a partir de las tarjetas no suspendidas.
 * Se mantienen en memoria porque la tabla `deck_stats` todavía no se recalcula
 * de forma periódica (las tarjetas aún no se estudian hasta el módulo de SRS).
 */
async function loadStatsByDeck(userId: string): Promise<Map<string, DeckStatsView>> {
  const cards = await prisma.card.findMany({
    where: { userId, isSuspended: false },
    select: {
      deckId: true,
      scheduling: { select: { status: true, dueDate: true } },
    },
  });

  const dueLimit = endOfTodayUtc();
  const statsByDeck = new Map<string, DeckStatsView>();

  for (const card of cards) {
    const stats = statsByDeck.get(card.deckId) ?? { ...EMPTY_STATS };
    const scheduling = card.scheduling;
    const status = scheduling?.status ?? "new";

    stats.total += 1;

    if (status === "new") {
      stats.new += 1;
    } else if (status === "learning" || status === "relearning") {
      stats.learning += 1;
    } else {
      stats.review += 1;
    }

    if (status !== "new" && scheduling && scheduling.dueDate <= dueLimit) {
      stats.dueToday += 1;
    }

    statsByDeck.set(card.deckId, stats);
  }

  return statsByDeck;
}

async function buildUserTree(
  userId: string
): Promise<{ tree: DeckNode[]; rows: DeckRow[]; statsByDeck: Map<string, DeckStatsView> }> {
  const [rows, statsByDeck] = await Promise.all([loadDeckRows(userId), loadStatsByDeck(userId)]);

  return { tree: buildDeckTree(rows, statsByDeck), rows, statsByDeck };
}

/**
 * Genera un slug único para el usuario. La búsqueda es global (no solo dentro del
 * mismo padre) porque las URLs de detalle usan únicamente el slug
 * (`/decks/[slug]`), por lo que dos mazos no pueden compartirlo.
 */
async function buildUniqueSlug(
  userId: string,
  name: string,
  excludeDeckId?: string
): Promise<string> {
  const base = slugify(name);
  let candidate = base;

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const existing = await prisma.deck.findFirst({
      where: {
        userId,
        slug: candidate,
        ...(excludeDeckId ? { id: { not: excludeDeckId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    const suffix = `-${attempt + 1}`;
    candidate = `${base.slice(0, 100 - suffix.length)}${suffix}`;
  }

  return `${base.slice(0, 90)}-${crypto.randomUUID().slice(0, 6)}`;
}

async function getOwnedDeck(userId: string, deckId: string): Promise<DeckRow> {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    select: deckSelect,
  });

  if (!deck) {
    throw new Error("El mazo no existe");
  }

  return deck;
}

interface ResolvedParent {
  parent: DeckRow | null;
  parentDeckId: string | null;
}

/**
 * Valida el mazo padre indicado: existencia, pertenencia al usuario, ausencia de
 * ciclos y respeto de la profundidad máxima (3 niveles).
 */
function resolveParent(
  rows: DeckRow[],
  depths: Map<string, number>,
  deck: DeckRow | null,
  parentDeckId: string | null
): ResolvedParent {
  if (!parentDeckId) {
    return { parent: null, parentDeckId: null };
  }

  if (deck && parentDeckId === deck.id) {
    throw new Error("Un mazo no puede ser su propio padre");
  }

  const parent = rows.find((row) => row.id === parentDeckId);

  if (!parent) {
    throw new Error("El mazo padre seleccionado no existe");
  }

  if (deck && collectDeckBranchIds(rows, deck.id).has(parentDeckId)) {
    throw new Error("No puedes mover un mazo dentro de uno de sus propios sub-mazos");
  }

  const resultingDepth = (depths.get(parentDeckId) ?? 1) + 1;

  if (resultingDepth > MAX_DECK_DEPTH) {
    throw new Error(`La jerarquía admite un máximo de ${MAX_DECK_DEPTH} niveles de mazos`);
  }

  return { parent, parentDeckId: parent.id };
}

function toDeckOptions(rows: DeckRow[], depths: Map<string, number>): DeckOption[] {
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      languageCode: row.languageCode,
      depth: depths.get(row.id) ?? 1,
      canHaveChildren: (depths.get(row.id) ?? 1) < MAX_DECK_DEPTH,
    }))
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name, "es"));
}

async function computeImpact(
  userId: string,
  rows: DeckRow[],
  deckId: string
): Promise<DeckDeleteImpact> {
  const branchIds = collectDeckBranchIds(rows, deckId);

  const cardCount = await prisma.card.count({
    where: { userId, deckId: { in: [...branchIds] } },
  });

  return { deckCount: branchIds.size, cardCount };
}

function toSummary(
  deck: DeckRow,
  depth: number,
  statsByDeck: Map<string, DeckStatsView>
): DeckSummary {
  const stats = statsByDeck.get(deck.id) ?? EMPTY_STATS;

  return toDeckSummary({
    id: deck.id,
    parentDeckId: deck.parentDeckId,
    name: deck.name,
    slug: deck.slug,
    description: deck.description,
    languageCode: deck.languageCode,
    isArchived: deck.isArchived,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
    lastStudiedAt: deck.lastStudiedAt ? deck.lastStudiedAt.toISOString() : null,
    depth,
    isMatch: true,
    stats,
    aggregate: { ...stats, subdeckCount: 0 },
    children: [],
  });
}

async function buildTransferDeck(
  userId: string,
  deckId: string,
  deckPath: string[] = []
): Promise<TransferDeck> {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    select: {
      ...deckSelect,
      cards: {
        select: {
          front: true,
          back: true,
          cardType: true,
          imageUrl: true,
          audioUrl: true,
          colorTag: true,
          isSuspended: true,
        },
        orderBy: { createdAt: "asc" },
      },
      childDecks: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });

  if (!deck) {
    throw new Error("El mazo no existe");
  }

  const path = [...deckPath, deck.name];

  return {
    name: deck.name,
    slug: deck.slug,
    description: deck.description,
    languageCode: deck.languageCode,
    isArchived: deck.isArchived,
    cards: deck.cards,
    subdecks: await Promise.all(
      deck.childDecks.map((child) => buildTransferDeck(userId, child.id, path))
    ),
  };
}

function cardDuplicateKey(front: string): string {
  return front.trim().toLowerCase();
}

export const decksRouter = {
  list: protectedProcedure
    .input(deckListInputSchema)
    .handler(async ({ input, context }): Promise<DeckListResult> => {
      const { tree } = await buildUserTree(context.user.id);

      const filtered = sortDeckTree(
        filterDeckTree(tree, {
          search: input.search && input.search.length > 0 ? input.search : null,
          language: input.language ?? null,
          includeArchived: input.includeArchived,
        }),
        input.sort,
        input.order
      );

      const visibleDecks = flattenDeckTree(filtered);

      return {
        decks: filtered,
        totalDecks: flattenDeckTree(tree).length,
        matchingDecks: visibleDecks.filter((node) => node.isMatch).length,
      };
    }),

  options: protectedProcedure
    .input(deckOptionsInputSchema)
    .handler(async ({ input, context }): Promise<{ options: DeckOption[] }> => {
      const rows = await loadDeckRows(context.user.id);
      const depths = computeDeckDepths(rows);
      const excluded = input.excludeDeckId
        ? collectDeckBranchIds(rows, input.excludeDeckId)
        : new Set<string>();

      return {
        options: toDeckOptions(rows, depths).filter((option) => !excluded.has(option.id)),
      };
    }),

  detail: protectedProcedure
    .input(deckSlugInputSchema)
    .handler(async ({ input, context }): Promise<DeckDetailResult> => {
      const { tree, rows } = await buildUserTree(context.user.id);
      const allNodes = flattenDeckTree(tree);
      const deck = allNodes.find((node) => node.slug === input.slug);

      if (!deck) {
        throw new Error("El mazo no existe");
      }

      const ancestors: DeckOption[] = [];
      let currentParentId = deck.parentDeckId;

      while (currentParentId) {
        const parent = allNodes.find((node) => node.id === currentParentId);

        if (!parent) {
          break;
        }

        ancestors.unshift({
          id: parent.id,
          name: parent.name,
          slug: parent.slug,
          languageCode: parent.languageCode,
          depth: parent.depth,
          canHaveChildren: parent.depth < MAX_DECK_DEPTH,
        });

        currentParentId = parent.parentDeckId;
      }

      return {
        deck: toDeckSummary(deck),
        ancestors,
        subDecks: deck.children,
        impact: await computeImpact(context.user.id, rows, deck.id),
        canHaveChildren: deck.depth < MAX_DECK_DEPTH,
      };
    }),

  create: protectedProcedure
    .input(deckCreateInputSchema)
    .handler(async ({ input, context }): Promise<{ deck: DeckSummary }> => {
      const userId = context.user.id;
      const rows = await loadDeckRows(userId);
      const depths = computeDeckDepths(rows);
      const { parentDeckId } = resolveParent(rows, depths, null, input.parentDeckId ?? null);

      const parentLanguage = parentDeckId
        ? rows.find((row) => row.id === parentDeckId)?.languageCode
        : null;

      const languageCode: LanguageCode =
        input.languageCode ??
        (parentLanguage && isLanguageCode(parentLanguage) ? parentLanguage : "es");

      const slug = await buildUniqueSlug(userId, input.name);

      const deck = await prisma.deck.create({
        data: {
          userId,
          parentDeckId,
          name: input.name,
          description: input.description && input.description.length > 0 ? input.description : null,
          languageCode,
          slug,
        },
        select: deckSelect,
      });

      return {
        deck: toSummary(
          deck,
          parentDeckId ? (depths.get(parentDeckId) ?? 1) + 1 : 1,
          new Map()
        ),
      };
    }),

  update: protectedProcedure
    .input(deckUpdateInputSchema)
    .handler(async ({ input, context }): Promise<{ deck: DeckSummary }> => {
      const userId = context.user.id;
      const rows = await loadDeckRows(userId);
      const current = await getOwnedDeck(userId, input.id);
      const hasParentChange = "parentDeckId" in input;
      const parentDeckId = hasParentChange
        ? resolveParent(rows, computeDeckDepths(rows), current, input.parentDeckId ?? null)
            .parentDeckId
        : current.parentDeckId;

      const data: Prisma.DeckUpdateInput = {};
      const isMoving = hasParentChange && parentDeckId !== current.parentDeckId;

      if (input.name !== undefined && input.name !== current.name) {
        data.name = input.name;
      }

      if (data.name !== undefined || isMoving) {
        // El slug es único por usuario + padre, así que se recalcula al renombrar
        // o al mover el mazo de ubicación.
        data.slug = await buildUniqueSlug(
          userId,
          input.name ?? current.name,
          current.id
        );
      }

      if (isMoving) {
        data.parentDeck = parentDeckId ? { connect: { id: parentDeckId } } : { disconnect: true };
      }

      if (input.description !== undefined) {
        data.description = input.description.length > 0 ? input.description : null;
      }

      if (input.languageCode !== undefined && input.languageCode !== current.languageCode) {
        data.languageCode = input.languageCode;
      }

      const deck =
        Object.keys(data).length === 0
          ? current
          : await prisma.deck.update({
              where: { id: current.id },
              data,
              select: deckSelect,
            });

      const rowsAfter = await loadDeckRows(userId);
      const statsByDeck = await loadStatsByDeck(userId);

      return {
        deck: toSummary(deck, computeDeckDepths(rowsAfter).get(deck.id) ?? 1, statsByDeck),
      };
    }),

  setArchived: protectedProcedure
    .input(deckArchiveInputSchema)
    .handler(async ({ input, context }): Promise<{ deck: DeckSummary }> => {
      const userId = context.user.id;
      const current = await getOwnedDeck(userId, input.id);

      const deck = await prisma.deck.update({
        where: { id: current.id },
        data: { isArchived: input.isArchived },
        select: deckSelect,
      });

      const depths = computeDeckDepths(await loadDeckRows(userId));

      return { deck: toSummary(deck, depths.get(deck.id) ?? 1, await loadStatsByDeck(userId)) };
    }),

  deleteImpact: protectedProcedure
    .input(deckIdInputSchema)
    .handler(async ({ input, context }): Promise<DeckDeleteImpact> => {
      const userId = context.user.id;
      const deck = await getOwnedDeck(userId, input.id);

      return computeImpact(userId, await loadDeckRows(userId), deck.id);
    }),

  remove: protectedProcedure
    .input(deckIdInputSchema)
    .handler(async ({ input, context }): Promise<DeckDeleteImpact> => {
      const userId = context.user.id;
      const deck = await getOwnedDeck(userId, input.id);
      const impact = await computeImpact(userId, await loadDeckRows(userId), deck.id);

      await prisma.deck.delete({ where: { id: deck.id } });

      return impact;
    }),

  export: protectedProcedure
    .input(deckExportInputSchema)
    .handler(
      async ({ input, context }): Promise<{ fileName: string; mimeType: string; content: string }> => {
        const deck = await getOwnedDeck(context.user.id, input.id);
        const transferDeck = await buildTransferDeck(context.user.id, deck.id);

        if (input.format === "csv") {
          return {
            fileName: `${deck.slug}.csv`,
            mimeType: "text/csv;charset=utf-8",
            content: serializeCsv(flattenTransferDeck(transferDeck)),
          };
        }

        const payload: JsonExportPayload = {
          version: 1,
          exportedAt: new Date().toISOString(),
          deck: transferDeck,
        };

        return {
          fileName: `${deck.slug}.json`,
          mimeType: "application/json;charset=utf-8",
          content: serializeJson(payload),
        };
      }
    ),

  import: protectedProcedure
    .input(deckImportInputSchema)
    .handler(async ({ input, context }): Promise<ImportResult> => {
      const userId = context.user.id;

      let parsedCards: TransferCard[];
      let deckName: string | null = null;
      let deckDescription: string | null = null;
      let deckLanguage: LanguageCode | null = null;

      if (input.format === "csv") {
        parsedCards = parseTransferFile(() => parseCsvImport(input.content).cards);
        deckName = stripExtension(input.fileName);
      } else {
        const parsed = parseTransferFile(() => parseJsonImport(input.content));
        parsedCards = parsed.cards;
        deckName = parsed.name ?? stripExtension(input.fileName);
        deckDescription = parsed.description;
        deckLanguage = parsed.languageCode;
      }

      let targetDeck: DeckRow;
      let createdDeck = false;

      if (input.deckId) {
        targetDeck = await getOwnedDeck(userId, input.deckId);
      } else {
        const name = (deckName && deckName.length > 0 ? deckName : "Mazo importado").slice(0, 100);
        const slug = await buildUniqueSlug(userId, name);

        targetDeck = await prisma.deck.create({
          data: {
            userId,
            name,
            description: deckDescription,
            languageCode: deckLanguage ?? "es",
            slug,
          },
          select: deckSelect,
        });

        createdDeck = true;
      }

      const existingCards = await prisma.card.findMany({
        where: { deckId: targetDeck.id },
        select: { id: true, front: true },
      });

      const cardsByKey = new Map(existingCards.map((card) => [cardDuplicateKey(card.front), card]));
      let createdCards = 0;
      let updatedCards = 0;
      let skippedCards = 0;

      for (const card of parsedCards) {
        const key = cardDuplicateKey(card.front);
        const existing = cardsByKey.get(key);

        if (!existing) {
          await prisma.card.create({
            data: {
              deckId: targetDeck.id,
              userId,
              cardType: card.cardType,
              front: card.front,
              back: card.back,
              imageUrl: card.imageUrl,
              audioUrl: card.audioUrl,
              colorTag: card.colorTag,
              isSuspended: card.isSuspended,
              scheduling: { create: { userId, status: "new" } },
            },
          });

          cardsByKey.set(key, { id: crypto.randomUUID(), front: card.front });
          createdCards += 1;
          continue;
        }

        if (input.duplicateStrategy === "skip") {
          skippedCards += 1;
          continue;
        }

        if (input.duplicateStrategy === "replace") {
          await prisma.card.update({
            where: { id: existing.id },
            data: {
              back: card.back,
              cardType: card.cardType,
              imageUrl: card.imageUrl,
              audioUrl: card.audioUrl,
              colorTag: card.colorTag,
            },
          });

          updatedCards += 1;
          continue;
        }

        const copyFront = `${card.front} (copia)`;

        await prisma.card.create({
          data: {
            deckId: targetDeck.id,
            userId,
            cardType: card.cardType,
            front: copyFront,
            back: card.back,
            imageUrl: card.imageUrl,
            audioUrl: card.audioUrl,
            colorTag: card.colorTag,
            isSuspended: card.isSuspended,
            scheduling: { create: { userId, status: "new" } },
          },
        });

        cardsByKey.set(cardDuplicateKey(copyFront), { id: crypto.randomUUID(), front: copyFront });
        createdCards += 1;
      }

      return {
        deckId: targetDeck.id,
        deckSlug: targetDeck.slug,
        createdDeck,
        createdCards,
        updatedCards,
        skippedCards,
      };
    }),
};

function stripExtension(fileName: string | undefined): string | null {
  if (!fileName) {
    return null;
  }

  const withoutExtension = fileName.replace(/\.(json|csv)$/i, "").trim();

  return withoutExtension.length > 0 ? withoutExtension : null;
}

/** Convierte los errores de transferencia en mensajes legibles para la UI. */
function parseTransferFile<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof DeckTransferError) {
      throw new Error([error.message, ...error.details.slice(0, 3)].join(" · "));
    }

    throw error;
  }
}

export type DecksRouter = typeof decksRouter;