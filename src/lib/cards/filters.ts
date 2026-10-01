import { isCardStatusFilter } from "@/constants/cards";
import { CARD_PAGE_SIZE, CARD_PAGE_SIZES, MAX_SEARCH_LENGTH } from "@/lib/validation/card";
import type { CardListFilters } from "@/types/card";

/** Lee un parámetro de la query string admitiendo valores repetidos. */
export function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;

  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

function parsePage(raw: string | null): number {
  if (!raw) {
    return 1;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parsePageSize(raw: string | null): CardListFilters["pageSize"] {
  const parsed = Number.parseInt(raw ?? "", 10);

  return (CARD_PAGE_SIZES as readonly number[]).includes(parsed)
    ? (parsed as CardListFilters["pageSize"])
    : CARD_PAGE_SIZE;
}

/**
 * Convierte la query string en filtros tipados. Los valores fuera del dominio
 * permitido caen al valor por defecto en lugar de lanzar un error: una URL
 * manipulada a mano no debe romper la página.
 */
export function parseCardFilters(
  params: Record<string, string | string[] | undefined>
): CardListFilters {
  const status = readParam(params, "status");
  const sort = readParam(params, "sort");
  const order = readParam(params, "order");
  const size = readParam(params, "size");
  const search = readParam(params, "q");

  return {
    search: search && search.length <= MAX_SEARCH_LENGTH ? search : null,
    status: status && isCardStatusFilter(status) ? status : "all",
    sort: sort === "front" || sort === "interval" || sort === "createdAt" ? sort : "createdAt",
    order: order === "asc" ? "asc" : "desc",
    page: parsePage(readParam(params, "page")),
    pageSize: parsePageSize(size),
  };
}