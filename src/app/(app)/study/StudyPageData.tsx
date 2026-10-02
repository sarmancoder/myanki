import { serverClient } from "@/server/client";
import StudyPage from "./StudyPage";

/**
 * Datos del panel de estudio: recuento de pendientes por mazo, límites diarios y
 * sesión reanudable. Se resuelve en el servidor para que el contador grande y el
 * selector de mazos coincidan siempre con la base de datos.
 */
export default async function StudyPageData() {
  const overview = await serverClient.study.overview({});

  return <StudyPage overview={overview} />;
}