import { redirect } from "next/navigation";
import { serverClient } from "@/server/client";
import StudySessionPage from "./StudySessionPage";

interface StudySessionPageDataProps {
  sessionId: string;
}

/**
 * Carga el estado de la sesión (cola pendiente, tarjetas y configuración del
 * planificador) en el servidor.
 *
 * Una sesión que no existe o que ya terminó no tiene interfaz de tarjetas: se
 * vuelve al panel de estudio, que ofrece reanudar otra sesión o abrir el resumen.
 */
export default async function StudySessionPageData({ sessionId }: StudySessionPageDataProps) {
  const state = await serverClient.study.getSession({ sessionId }).catch(() => null);

  if (!state) {
    redirect("/study");
  }

  return <StudySessionPage initialState={state} />;
}