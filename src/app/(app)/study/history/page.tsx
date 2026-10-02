import { Suspense } from "react";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";
import StudyHistoryPageData from "./StudyHistoryPageData";

interface StudyHistoryRouteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StudyHistoryRoute({ searchParams }: StudyHistoryRouteProps) {
  const query = await searchParams;
  const raw = Array.isArray(query.page) ? query.page[0] : query.page;
  const parsed = Number.parseInt(raw ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  return (
    <Suspense fallback={<DashboardSkeleton cards={4} />}>
      <StudyHistoryPageData page={page} />
    </Suspense>
  );
}