import { serverClient } from "@/server/client";
import SrsSettingsPage from "./SrsSettingsPage";

/**
 * Segunda fase de carga de la página de ajustes del SRS: la configuración y la
 * vista previa por defecto llegan desde el servidor, envueltas en el `<Suspense>`
 * de `page.tsx`.
 */
export default async function SrsSettingsPageData() {
  const result = await serverClient.srs.getSettings();

  return <SrsSettingsPage initialSettings={result.settings} />;
}