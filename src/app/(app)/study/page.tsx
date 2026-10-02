import { Suspense } from "react";
import { languageIdSchema } from "@/lib/validation/language";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";
import StudyPageData from "./StudyPageData";

interface StudyRouteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * El filtro de idiomas viaja en la URL (`?lang=<id del idioma>`) para que la
 * vista se pueda compartir y el servidor cargue solo los mazos de ese idioma.
 */
export default async function StudyRoute({ searchParams }: StudyRouteProps) {
  const params = await searchParams;
  const rawLanguage = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const languageId = languageIdSchema.safeParse(rawLanguage?.trim() || null);

  return (
    <Suspense fallback={<DashboardSkeleton cards={3} />}>
      <StudyPageData languageId={languageId.success ? languageId.data : null} />
    </Suspense>
  );
}