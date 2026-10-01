import { Suspense } from "react";
import SettingsPage from "./SettingsPage";

export default function Settings() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">
      <div className="text-primary">Cargando...</div>
    </div>}>
      <SettingsPage />
    </Suspense>
  );
}
