"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CARD_STATUS_FILTERS, CARD_STATUS_FILTER_LABELS, type CardStatusFilter } from "@/constants/cards";
import { CARD_PAGE_SIZES } from "@/lib/validation/card";
import { formatNumber } from "@/lib/format";
import type { CardListFilters } from "@/types/card";

interface CardFiltersProps {
  filters: CardListFilters;
  statusCounts: Record<CardStatusFilter, number>;
  totalCards: number;
  deckTotalCards: number;
}

const SORT_OPTIONS = [
  { value: "createdAt", label: "Fecha de creación" },
  { value: "front", label: "Anverso (A-Z)" },
  { value: "interval", label: "Intervalo SRS" },
] as const;

const INPUT_CLASS =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";

export default function CardFilters({
  filters,
  statusCounts,
  totalCards,
  deckTotalCards,
}: CardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(filters.search ?? "");
  const isFirstRender = useRef(true);

  const applyFilters = useCallback(
    (next: Partial<CardListFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();

      if (merged.search) {
        params.set("q", merged.search);
      }

      if (merged.status !== "all") {
        params.set("status", merged.status);
      }

      if (merged.sort !== "createdAt") {
        params.set("sort", merged.sort);
      }

      if (merged.order !== "desc") {
        params.set("order", merged.order);
      }

      if (merged.pageSize !== CARD_PAGE_SIZES[0]) {
        params.set("size", String(merged.pageSize));
      }

      // Cualquier cambio de filtro vuelve a la primera página: mantener la página
      // actual mostraría una lista vacía o incoherente.
      if (next.page === undefined) {
        params.set("page", "1");
      } else if (next.page > 1) {
        params.set("page", String(next.page));
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [filters, pathname, router]
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      if (search !== (filters.search ?? "")) {
        applyFilters({ search: search.trim() || null });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [search, filters.search, applyFilters]);

  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.status !== "all" ||
    filters.sort !== "createdAt" ||
    filters.order !== "desc" ||
    filters.pageSize !== CARD_PAGE_SIZES[0];

  return (
    <section className="rounded-lg border border-border bg-background p-4" aria-label="Filtros de tarjetas">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="card-search" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Buscar en anverso o reverso
          </label>
          <input
            id="card-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ej. kanji, comida, {{c1::...}}"
            className={`${INPUT_CLASS} w-full`}
          />
        </div>

        <div>
          <label htmlFor="card-status" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Estado
          </label>
          <select
            id="card-status"
            value={filters.status}
            onChange={(event) => applyFilters({ status: event.target.value as CardStatusFilter })}
            className={`${INPUT_CLASS} w-full`}
          >
            {CARD_STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>
                {CARD_STATUS_FILTER_LABELS[status]} ({statusCounts[status]})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="card-sort" className="mb-1 block text-xs font-medium text-secondary-foreground">
            Ordenar por
          </label>
          <div className="flex gap-2">
            <select
              id="card-sort"
              value={filters.sort}
              onChange={(event) =>
                applyFilters({ sort: event.target.value as CardListFilters["sort"] })
              }
              className={`${INPUT_CLASS} w-full`}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => applyFilters({ order: filters.order === "asc" ? "desc" : "asc" })}
              title={filters.order === "asc" ? "Ascendente" : "Descendente"}
              aria-label={filters.order === "asc" ? "Orden ascendente" : "Orden descendente"}
              className="rounded-lg border border-border px-3 text-sm text-primary transition-colors hover:bg-secondary"
            >
              {filters.order === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="card-page-size" className="text-xs font-medium text-secondary-foreground">
            Por página
          </label>
          <select
            id="card-page-size"
            value={filters.pageSize}
            onChange={(event) => applyFilters({ pageSize: Number(event.target.value) })}
            className={`${INPUT_CLASS} py-1.5 text-xs`}
          >
            {CARD_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-secondary-foreground">
            {totalCards === deckTotalCards
              ? `${formatNumber(totalCards)} tarjeta${totalCards === 1 ? "" : "s"}`
              : `${formatNumber(totalCards)} de ${formatNumber(deckTotalCards)} tarjetas`}
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                applyFilters({
                  search: null,
                  status: "all",
                  sort: "createdAt",
                  order: "desc",
                  pageSize: CARD_PAGE_SIZES[0],
                });
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>
    </section>
  );
}