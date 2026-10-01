"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LANGUAGES, isLanguageCode } from "@/constants/languages";
import type { DeckListFilters } from "@/types/deck";

interface DeckFiltersProps {
  filters: DeckListFilters;
  totalDecks: number;
  matchingDecks: number;
}

const SORT_OPTIONS = [
  { value: "createdAt", label: "Fecha de creación" },
  { value: "name", label: "Nombre" },
  { value: "cards", label: "Número de tarjetas" },
] as const;

const INPUT_CLASS =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";

export default function DeckFilters({ filters, totalDecks, matchingDecks }: DeckFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(filters.search ?? "");
  const isFirstRender = useRef(true);

  const applyFilters = useCallback(
    (next: Partial<DeckListFilters>) => {
      const merged = { ...filters, ...next };
      const params = new URLSearchParams();

      if (merged.search) {
        params.set("q", merged.search);
      }

      if (merged.language) {
        params.set("lang", merged.language);
      }

      if (merged.sort !== "createdAt") {
        params.set("sort", merged.sort);
      }

      if (merged.order !== "desc") {
        params.set("order", merged.order);
      }

      if (merged.includeArchived) {
        params.set("archived", "1");
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

  function handleReset() {
    setSearch("");
    applyFilters({
      search: null,
      language: null,
      sort: "createdAt",
      order: "desc",
      includeArchived: false,
    });
  }

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.language) ||
    filters.sort !== "createdAt" ||
    filters.order !== "desc" ||
    filters.includeArchived;

  return (
    <section className="rounded-lg border border-border bg-background p-4" aria-label="Filtros de mazos">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="deck-search" className="mb-1 block text-xs font-medium text-secondary">
            Buscar por nombre
          </label>
          <input
            id="deck-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Ej. kanji, inglés B2..."
            className={`${INPUT_CLASS} w-full`}
          />
        </div>

        <div>
          <label htmlFor="deck-language-filter" className="mb-1 block text-xs font-medium text-secondary">
            Idioma
          </label>
          <select
            id="deck-language-filter"
            value={filters.language ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              applyFilters({ language: isLanguageCode(value) ? value : null });
            }}
            className={`${INPUT_CLASS} w-full`}
          >
            <option value="">Todos los idiomas</option>
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.flag} {language.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="deck-sort" className="mb-1 block text-xs font-medium text-secondary">
            Ordenar por
          </label>
          <div className="flex gap-2">
            <select
              id="deck-sort"
              value={filters.sort}
              onChange={(event) =>
                applyFilters({ sort: event.target.value as DeckListFilters["sort"] })
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
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={(event) => applyFilters({ includeArchived: event.target.checked })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          Mostrar mazos archivados
        </label>

        <div className="flex items-center gap-3">
          <span className="text-xs text-secondary">
            {matchingDecks} de {totalDecks} mazo{totalDecks === 1 ? "" : "s"}
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleReset}
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