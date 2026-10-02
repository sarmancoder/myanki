import { Suspense } from "react";
import { languageIdSchema } from "@/lib/validation/language";
import type { DeckListFilters } from "@/types/deck";
import DecksPageData from "./DecksPageData";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";

interface DecksPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | null {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;

  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

export default async function DecksPage({ searchParams }: DecksPageProps) {
  const params = await searchParams;
  const language = readParam(params, "lang");
  const sort = readParam(params, "sort");
  const order = readParam(params, "order");
  // El idioma se filtra por id: el código depende del catálogo de cada usuario, así
  // que la URL lleva el identificador y no un valor de una lista cerrada.
  const languageId = languageIdSchema.safeParse(language);

  const filters: DeckListFilters = {
    search: readParam(params, "q"),
    languageId: languageId.success ? languageId.data : null,
    sort: sort === "name" || sort === "cards" || sort === "createdAt" ? sort : "createdAt",
    order: order === "asc" ? "asc" : "desc",
    includeArchived: readParam(params, "archived") === "1",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Suspense fallback={<DashboardSkeleton cards={2} />}>
        <DecksPageData filters={filters} />
      </Suspense>
    </div>
  );
}