"use client";

import { usePathname, useRouter } from "next/navigation";
import { formatNumber } from "@/lib/format";

interface CardPaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalCards: number;
}

/**
 * Paginación por query string: el estado vive en la URL, así que la lista es
 * enlazable y el botón "atrás" del navegador funciona.
 */
export default function CardPagination({ page, totalPages, pageSize, totalCards }: CardPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (totalPages <= 1) {
    return (
      <p className="text-center text-xs text-secondary-foreground">
        {formatNumber(totalCards)} tarjeta{totalCards === 1 ? "" : "s"} en total
      </p>
    );
  }

  function goTo(nextPage: number) {
    const params = new URLSearchParams();

    // Se conservan los filtros activos al cambiar de página.
    const current = new URLSearchParams(window.location.search);
    current.forEach((value, key) => params.set(key, value));

    if (nextPage > 1) {
      params.set("page", String(nextPage));
    } else {
      params.delete("page");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const firstVisible = (page - 1) * pageSize + 1;
  const lastVisible = Math.min(page * pageSize, totalCards);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3"
      aria-label="Paginación de tarjetas"
    >
      <p className="text-xs text-secondary-foreground">
        Mostrando {formatNumber(firstVisible)}–{formatNumber(lastVisible)} de{" "}
        {formatNumber(totalCards)}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          ← Anterior
        </button>

        <span className="text-xs font-medium text-secondary-foreground">
          Página {page} de {totalPages}
        </span>

        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Siguiente →
        </button>
      </div>
    </nav>
  );
}