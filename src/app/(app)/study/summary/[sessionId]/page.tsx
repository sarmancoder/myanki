import { Suspense } from "react";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";
import StudySummaryPageData from "./StudySummaryPageData";

interface StudySummaryRouteProps {
  params: Promise<{ sessionId: string }>;
}

export default async function StudySummaryRoute({ params }: StudySummaryRouteProps) {
  const { sessionId } = await params;

  return (
    <Suspense fallback={<DashboardSkeleton cards={4} />}>
      <StudySummaryPageData sessionId={sessionId} />
    </Suspense>
  );
}