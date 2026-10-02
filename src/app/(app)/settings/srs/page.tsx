import { Suspense } from "react";
import DashboardSkeleton from "@/components/layout/DashboardSkeleton";
import SrsSettingsPageData from "./SrsSettingsPageData";

export default function SrsSettingsRoute() {
  return (
    <Suspense fallback={<DashboardSkeleton cards={2} />}>
      <SrsSettingsPageData />
    </Suspense>
  );
}