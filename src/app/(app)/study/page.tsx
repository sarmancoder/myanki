import { Suspense } from "react";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";
import StudyPageData from "./StudyPageData";

export default function StudyRoute() {
  return (
    <Suspense fallback={<DashboardSkeleton cards={3} />}>
      <StudyPageData />
    </Suspense>
  );
}