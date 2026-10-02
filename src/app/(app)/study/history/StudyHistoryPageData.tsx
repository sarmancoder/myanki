import { serverClient } from "@/server/client";
import { STUDY_DAILY_STATS_DAYS, STUDY_HISTORY_PAGE_SIZE } from "@/constants/study";
import StudyHistoryPage from "./StudyHistoryPage";

interface StudyHistoryPageDataProps {
  page: number;
}

/** Historial paginado de sesiones finalizadas y estadísticas por día. */
export default async function StudyHistoryPageData({ page }: StudyHistoryPageDataProps) {
  const [result, stats] = await Promise.all([
    serverClient.study.history({ page, pageSize: STUDY_HISTORY_PAGE_SIZE }),
    serverClient.study.dailyStats({ days: STUDY_DAILY_STATS_DAYS }),
  ]);

  return <StudyHistoryPage result={result} stats={stats} />;
}