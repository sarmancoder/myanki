import { serverClient } from "@/server/client";
import StudyPage from "./StudyPage";

interface StudyPageDataProps {
  /** Idioma por el que se filtra la lista de mazos, o `null` para ver todos. */
  languageId: string | null;
}

export default async function StudyPageData({ languageId }: StudyPageDataProps) {
  const overview = await serverClient.study.overview({ languageId });
  return <StudyPage overview={overview} />;
}