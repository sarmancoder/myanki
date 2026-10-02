"use client";

import { useState } from "react";
import Link from "next/link";
import SrsSettingsForm from "@/components/forms/SrsSettingsForm";
import SrsPreviewForm from "@/components/srs/SrsPreviewForm";
import type { SrsSettingsView } from "@/types/srs";

interface SrsSettingsPageProps {
  initialSettings: SrsSettingsView;
}

export default function SrsSettingsPage({ initialSettings }: SrsSettingsPageProps) {
  const [settings, setSettings] = useState<SrsSettingsView>(initialSettings);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/settings"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← Volver a los ajustes
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-primary sm:text-3xl">Algoritmo de repetición</h1>
        <p className="mt-2 max-w-3xl text-sm text-secondary-foreground">
          Ajusta cómo se programan los repasos: algoritmo, factor de facilidad, intervalo máximo y las
          escaleras de aprendizaje y reaprendizaje. Los cambios se aplican a las próximas calificaciones; las
          tarjetas ya programadas conservan su intervalo hasta que se repasen.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-background p-6">
        <h2 className="text-lg font-semibold text-primary">Configuración</h2>
        <p className="mb-4 mt-1 text-sm text-secondary-foreground">
          Se guarda en la tabla <code className="font-mono text-xs">srs_settings</code> y solo afecta a tu
          cuenta.
        </p>
        <SrsSettingsForm settings={settings} onSuccess={setSettings} />
      </section>

      <section className="mt-6 rounded-lg border border-border bg-background p-6">
        <h2 className="text-lg font-semibold text-primary">Previsualización de intervalos</h2>
        <p className="mb-4 mt-1 text-sm text-secondary-foreground">
          Comprueba cómo quedaría cada calificación (Again, Hard, Good, Easy) antes de estudiar. No modifica
          ninguna tarjeta.
        </p>
        <SrsPreviewForm settings={settings} />
      </section>
    </div>
  );
}