import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { protectedProcedure } from "@/server/procedures";
import { deleteMedia, saveMedia } from "@/lib/storage";
import { hasCloze } from "@/lib/cards/cloze";
import { parseBatchCards } from "@/lib/cards/batch";
import { buildCardListWhere, buildCardOrderBy } from "@/lib/cards/query";
import { computeDeckDepths } from "@/lib/decks/tree";
import { extraFieldsToJson, normalizeExtraFields } from "@/lib/cards/extra-fields";
import { emptyStatusCounts, toCardListItem } from "@/lib/cards/serialize";
import {
  cardBatchCreateInputSchema,
  cardBatchDeleteInputSchema,
  cardCreateInputSchema,
  cardDeleteInputSchema,
  cardIdInputSchema,
  cardListInputSchema,
  cardMoveInputSchema,
  cardSuspendInputSchema,
  cardUpdateInputSchema,
  mediaUploadInputSchema,
} from "@/lib/validation/card";
import type {
  BatchCreateResult,
  BatchDeleteResult,
  BatchSuspendResult,
  CardDetail,
  CardListResult,
  CardMoveResult,
  CardMutationResult,
  UploadMediaResult,
} from "@/types/card";
import type { DeckOption } from "@/types/deck";

const cardSelect = {
  id: true,
  deckId: true,
  cardType: true,
  front: true,
  back: true,
  extraFields: true,
  imageUrl: true,
  audioUrl: true,
  isSuspended: true,
  colorTag: true,
  createdAt: true,
  updatedAt: true,
  deck: { select: { id: true, name: true, slug: true } },
  scheduling: {
    select: {
      status: true,
      easeFactor: true,
      intervalDays: true,
      repetitions: true,
      lapses: true,
      dueDate: true,
      lastReviewedAt: true,
    },
  },
} satisfies Prisma.CardSelect;

type CardRow = Prisma.CardGetPayload<{ select: typeof cardSelect }>;

const REVIEW_SELECT_LIMIT = 20;

function serialize(row: CardRow): CardMutationResult {
  return { card: toCardListItem(row, normalizeExtraFields) };
}

async function getOwnedCard(userId: string, cardId: string): Promise<CardRow> {
  const card = await prisma.card.findFirst({
    where: { id: cardId, userId },
    select: cardSelect,
  });

  if (!card) {
    throw new Error("La tarjeta no existe");
  }

  return card;
}

async function getOwnedDeck(userId: string, deckId: string): Promise<{ id: string; name: string; slug: string }> {
  const deck = await prisma.deck.findFirst({
    where: { id: deckId, userId },
    select: { id: true, name: true, slug: true },
  });

  if (!deck) {
    throw new Error("El mazo no existe");
  }

  return deck;
}

/**
 * Valida que el anverso tenga sentido para el tipo de tarjeta: una cloze sin
 * ningún `{{c1::...}}` no se puede estudiar en el módulo de SRS.
 */
function assertCardTypeIsUsable(cardType: string, front: string): void {
  if (cardType === "cloze" && !hasCloze(front)) {
    throw new Error(
      'Una tarjeta cloze necesita al menos un borrado en el anverso, con el formato {{c1::texto}}'
    );
  }
}

/**
 * Adjunta una tarjeta nueva. El registro de `card_scheduling` se crea siempre en
 * la misma transacción: el módulo de estudio y las estadísticas del mazo asumen
 * que toda tarjeta tiene exactamente uno.
 */
async function createCard(
  userId: string,
  data: {
    deckId: string;
    cardType: string;
    front: string;
    back: string;
    extraFields: Prisma.InputJsonObject;
    imageUrl: string | null;
    audioUrl: string | null;
    colorTag: string | null;
    isSuspended: boolean;
  }
): Promise<CardRow> {
  return prisma.card.create({
    data: {
      userId,
      deckId: data.deckId,
      cardType: data.cardType,
      front: data.front,
      back: data.back,
      extraFields: data.extraFields,
      imageUrl: data.imageUrl,
      audioUrl: data.audioUrl,
      colorTag: data.colorTag,
      isSuspended: data.isSuspended,
      scheduling: { create: { userId, status: "new" } },
    },
    select: cardSelect,
  });
}

/**
 * Recuentos por estado del mazo completo, sin aplicar búsqueda ni filtro.
 *
 * Las tarjetas suspendidas se contabilizan aparte y quedan fuera de "todas" y de
 * los estados de aprendizaje: así la suma de los contadores cuadra con el total
 * del mazo, igual que las estadísticas de la ficha del mazo.
 */
async function loadStatusCounts(userId: string, deckId: string) {
  const [deckTotalCards, suspended, byStatus] = await Promise.all([
    prisma.card.count({ where: { userId, deckId } }),
    prisma.card.count({ where: { userId, deckId, isSuspended: true } }),
    prisma.cardScheduling.groupBy({
      by: ["status"],
      where: { userId, card: { deckId, isSuspended: false } },
      _count: { _all: true },
    }),
  ]);

  const counts = emptyStatusCounts();

  counts.all = deckTotalCards - suspended;
  counts.suspended = suspended;

  for (const group of byStatus) {
    if (group.status in counts) {
      counts[group.status as keyof typeof counts] = group._count._all;
    }
  }

  return { deckTotalCards, counts };
}

/** Borra los adjuntos locales de una tarjeta cuando se liberan. */
async function cleanupMedia(imageUrl: string | null, audioUrl: string | null, userId: string) {
  await Promise.all([deleteMedia(imageUrl ?? "", userId), deleteMedia(audioUrl ?? "", userId)]);
}

export const cardsRouter = {
  list: protectedProcedure
    .input(cardListInputSchema)
    .handler(async ({ input, context }): Promise<CardListResult> => {
      const userId = context.user.id;

      await getOwnedDeck(userId, input.deckId);

      const where = buildCardListWhere({
        deckId: input.deckId,
        userId,
        search: input.search && input.search.length > 0 ? input.search : null,
        status: input.status,
      });

      const [rows, totalCards, statusCounts] = await Promise.all([
        prisma.card.findMany({
          where,
          select: cardSelect,
          orderBy: buildCardOrderBy(input.sort, input.order),
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
        prisma.card.count({ where }),
        loadStatusCounts(userId, input.deckId),
      ]);

      return {
        cards: rows.map((row) => toCardListItem(row, normalizeExtraFields)),
        deckTotalCards: statusCounts.deckTotalCards,
        totalCards,
        page: input.page,
        pageSize: input.pageSize,
        totalPages: Math.max(Math.ceil(totalCards / input.pageSize), 1),
        statusCounts: statusCounts.counts,
      };
    }),

  detail: protectedProcedure
    .input(cardIdInputSchema)
    .handler(async ({ input, context }): Promise<CardDetail> => {
      const card = await getOwnedCard(context.user.id, input.id);

      const reviews = await prisma.cardReview.findMany({
        where: { cardId: card.id },
        select: {
          id: true,
          rating: true,
          reviewedAt: true,
          intervalBefore: true,
          intervalAfter: true,
        },
        orderBy: { reviewedAt: "desc" },
        take: REVIEW_SELECT_LIMIT,
      });

      return {
        ...toCardListItem(card, normalizeExtraFields),
        reviews: reviews.map((review) => ({
          id: review.id,
          rating: review.rating,
          reviewedAt: review.reviewedAt.toISOString(),
          intervalBefore: review.intervalBefore,
          intervalAfter: review.intervalAfter,
        })),
      };
    }),

  /** Mazos a los que se puede mover una tarjeta, para poblar el selector del modal. */
  moveTargets: protectedProcedure
    .input(cardIdInputSchema)
    .handler(async ({ input, context }): Promise<{ options: DeckOption[] }> => {
      const userId = context.user.id;
      const card = await getOwnedCard(userId, input.id);

      const rows = await prisma.deck.findMany({
        where: { userId },
        select: {
      id: true,
      name: true,
      slug: true,
      parentDeckId: true,
      language: { select: { id: true, code: true, name: true, flag: true } },
    },
      });

      const depths = computeDeckDepths(rows);

      return {
        options: rows
          .filter((row) => row.id !== card.deckId)
          .map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            language: row.language,
            depth: depths.get(row.id) ?? 1,
            canHaveChildren: false,
          }))
          .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name, "es")),
      };
    }),

  create: protectedProcedure
    .input(cardCreateInputSchema)
    .handler(async ({ input, context }): Promise<CardMutationResult> => {
      const userId = context.user.id;

      await getOwnedDeck(userId, input.deckId);
      assertCardTypeIsUsable(input.cardType, input.front);

      const card = await createCard(userId, {
        deckId: input.deckId,
        cardType: input.cardType,
        front: input.front,
        back: input.back,
        extraFields: extraFieldsToJson(input.extraFields),
        imageUrl: input.imageUrl ?? null,
        audioUrl: input.audioUrl ?? null,
        colorTag: input.colorTag ?? null,
        isSuspended: input.isSuspended,
      });

      return serialize(card);
    }),

  createBatch: protectedProcedure
    .input(cardBatchCreateInputSchema)
    .handler(async ({ input, context }): Promise<BatchCreateResult> => {
      const userId = context.user.id;

      await getOwnedDeck(userId, input.deckId);

      const parsed = parseBatchCards(input.content);

      // Las líneas inválidas se devuelven al cliente en lugar de abortar: el usuario
      // necesita saber exactamente qué líneas fallaron para corregirlas.
      const created = await Promise.all(
        parsed.cards.map((draft) => {
          assertCardTypeIsUsable(input.cardType, draft.front);

          return createCard(userId, {
            deckId: input.deckId,
            cardType: input.cardType,
            front: draft.front,
            back: draft.back,
            extraFields: {},
            imageUrl: null,
            audioUrl: null,
            colorTag: input.colorTag ?? null,
            isSuspended: false,
          });
        })
      );

      return {
        created: created.length,
        failed: parsed.failures,
        cards: created.map((row) => toCardListItem(row, normalizeExtraFields)),
      };
    }),

  update: protectedProcedure
    .input(cardUpdateInputSchema)
    .handler(async ({ input, context }): Promise<CardMutationResult> => {
      const userId = context.user.id;
      const current = await getOwnedCard(userId, input.id);

      if (input.deckId !== undefined && input.deckId !== current.deckId) {
        await getOwnedDeck(userId, input.deckId);
      }

      const nextFront = input.front ?? current.front;
      const nextCardType = input.cardType ?? current.cardType;

      assertCardTypeIsUsable(nextCardType, nextFront);

      const data: Prisma.CardUpdateInput = {};

      if (input.cardType !== undefined) {
        data.cardType = input.cardType;
      }

      if (input.front !== undefined) {
        data.front = input.front;
      }

      if (input.back !== undefined) {
        data.back = input.back;
      }

      if (input.extraFields !== undefined) {
        data.extraFields = extraFieldsToJson(input.extraFields);
      }

      if (input.colorTag !== undefined) {
        data.colorTag = input.colorTag;
      }

      if (input.isSuspended !== undefined) {
        data.isSuspended = input.isSuspended;
      }

      if (input.deckId !== undefined && input.deckId !== current.deckId) {
        data.deck = { connect: { id: input.deckId } };
      }

      // Un adjunto reemplazado o eliminado se borra del disco, pero solo si es un
      // archivo propio del usuario. Las URLs externas no se tocan.
      const removedMedia: string[] = [];

      if (input.imageUrl !== undefined && input.imageUrl !== current.imageUrl) {
        data.imageUrl = input.imageUrl;

        if (current.imageUrl) {
          removedMedia.push(current.imageUrl);
        }
      }

      if (input.audioUrl !== undefined && input.audioUrl !== current.audioUrl) {
        data.audioUrl = input.audioUrl;

        if (current.audioUrl) {
          removedMedia.push(current.audioUrl);
        }
      }

      const card =
        Object.keys(data).length === 0
          ? current
          : await prisma.card.update({
              where: { id: current.id },
              data,
              select: cardSelect,
            });

      await Promise.all(removedMedia.map((url) => deleteMedia(url, userId)));

      return serialize(card);
    }),

  remove: protectedProcedure
    .input(cardDeleteInputSchema)
    .handler(async ({ input, context }): Promise<{ id: string }> => {
      const userId = context.user.id;
      const card = await getOwnedCard(userId, input.id);

      // `card_scheduling` y `card_reviews` caen por ON DELETE CASCADE.
      await prisma.card.delete({ where: { id: card.id } });
      await cleanupMedia(card.imageUrl, card.audioUrl, userId);

      return { id: card.id };
    }),

  batchRemove: protectedProcedure
    .input(cardBatchDeleteInputSchema)
    .handler(async ({ input, context }): Promise<BatchDeleteResult> => {
      const userId = context.user.id;

      const cards = await prisma.card.findMany({
        where: { id: { in: input.ids }, userId },
        select: { id: true, imageUrl: true, audioUrl: true },
      });

      if (cards.length === 0) {
        return { deleted: 0 };
      }

      const deletedIds = cards.map((card) => card.id);

      await prisma.card.deleteMany({ where: { id: { in: deletedIds }, userId } });

      await Promise.all(
        cards.flatMap((card) => [deleteMedia(card.imageUrl ?? "", userId), deleteMedia(card.audioUrl ?? "", userId)])
      );

      return { deleted: deletedIds.length };
    }),

  batchSuspend: protectedProcedure
    .input(cardSuspendInputSchema)
    .handler(async ({ input, context }): Promise<BatchSuspendResult> => {
      const result = await prisma.card.updateMany({
        where: { id: { in: input.ids }, userId: context.user.id },
        data: { isSuspended: input.isSuspended },
      });

      return { updated: result.count };
    }),

  batchMove: protectedProcedure
    .input(cardMoveInputSchema)
    .handler(async ({ input, context }): Promise<CardMoveResult> => {
      const userId = context.user.id;
      const deck = await getOwnedDeck(userId, input.deckId);

      // Las tarjetas suspendidas mantienen su estado al cambiar de mazo: la decisión
      // de estudiarlas sigue siendo del usuario.
      await prisma.card.updateMany({
        where: { id: { in: input.ids }, userId },
        data: { deckId: input.deckId },
      });

      const card = await getOwnedCard(userId, input.ids[0] as string);

      return {
        card: toCardListItem(card, normalizeExtraFields),
        deck: { id: deck.id, name: deck.name, slug: deck.slug },
      };
    }),

  uploadMedia: protectedProcedure
    .input(mediaUploadInputSchema)
    .handler(async ({ input, context }): Promise<UploadMediaResult> => {
      try {
        return await saveMedia({
          userId: context.user.id,
          kind: input.kind,
          base64: input.base64,
          mimeType: input.mimeType,
        });
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(error.message);
        }

        throw error;
      }
    }),
};

export type CardsRouter = typeof cardsRouter;