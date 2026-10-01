import type { Prisma } from "@prisma/client";
import type { CardStatusFilter, CardSort, SortOrder } from "@/types/card";

/**
 * Traduce los filtros del listado (URL) a la consulta de Prisma.
 *
 * La búsqueda se hace con `contains` + `mode: insensitive` en lugar del índice
 * GIN de texto completo que propone la spec: con las tablas ya creadas en el
 * módulo 02, `ILIKE` cubre el caso de uso (búsqueda parcial dentro del mazo) sin
 * exigir una migración ni un diccionario por idioma. El índice FTS puede
 * activarse más adelante sin tocar esta capa.
 */
export function buildCardListWhere(input: {
  deckId: string;
  userId: string;
  search: string | null;
  status: CardStatusFilter;
}): Prisma.CardWhereInput {
  const where: Prisma.CardWhereInput = {
    deckId: input.deckId,
    userId: input.userId,
  };

  if (input.status === "suspended") {
    // La suspensión manda sobre el estado de SRS: una tarjeta suspendida se
    // listaría dos veces si solo se filtrara por `scheduling.status`.
    where.isSuspended = true;
  } else {
    // El resto de filtros excluyen las suspendidas, de modo que `all` y los
    // estados de aprendizaje forman una partición con `suspended`.
    where.isSuspended = false;

    if (input.status !== "all") {
      where.scheduling = { status: input.status };
    }
  }

  if (input.search && input.search.length > 0) {
    where.OR = [
      { front: { contains: input.search, mode: "insensitive" } },
      { back: { contains: input.search, mode: "insensitive" } },
    ];
  }

  return where;
}

/**
 * Ordena por intervalo del SRS cuando se pide, y siempre desempata por fecha de
 * creación para que la paginación sea estable.
 */
export function buildCardOrderBy(sort: CardSort, order: SortOrder): Prisma.CardOrderByWithRelationInput[] {
  const direction: Prisma.SortOrder = order === "asc" ? "asc" : "desc";

  if (sort === "front") {
    return [{ front: direction }, { createdAt: "desc" }];
  }

  if (sort === "interval") {
    // Las tarjetas sin scheduling (no debería ocurrir, la relación es 1:1 y se
    // crea siempre junto a la tarjeta) quedan al final en ambos sentidos.
    return [{ scheduling: { intervalDays: direction } }, { createdAt: "desc" }];
  }

  return [{ createdAt: direction }, { id: "asc" }];
}