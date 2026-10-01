"use client";

import { useState } from "react";
import { updateSettingsAction } from "@/server/actions";
import { isSuccess, isError } from "@/lib/orpc";

interface Settings {
  maxNewCardsPerDay: number;
  maxReviewsPerDay: number;
  dailyStudyGoalMinutes: number;
}

interface SettingsFormProps {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
}

export default function SettingsForm({ settings, onUpdate }: SettingsFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const maxNewCardsPerDay = Number(formData.get("maxNewCardsPerDay"));
    const maxReviewsPerDay = Number(formData.get("maxReviewsPerDay"));
    const dailyStudyGoalMinutes = Number(formData.get("dailyStudyGoalMinutes"));

    try {
      const result = await updateSettingsAction({
        maxNewCardsPerDay,
        maxReviewsPerDay,
        dailyStudyGoalMinutes,
      });

      if (isError(result)) {
        setMessage({ type: "error", text: result[1].message || "Error al actualizar" });
        setIsLoading(false);
        return;
      }

      if (isSuccess(result)) {
        onUpdate(result[0].settings);
        setMessage({ type: "success", text: "Preferencias actualizadas correctamente" });
      }
    } catch {
      setMessage({ type: "error", text: "Error de conexión" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-4 ${
            message.type === "success"
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-red-500 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div>
        <label htmlFor="maxNewCardsPerDay" className="block text-sm font-medium text-primary">
          Tarjetas nuevas por día
        </label>
        <input
          id="maxNewCardsPerDay"
          name="maxNewCardsPerDay"
          type="number"
          min="1"
          max="500"
          required
          defaultValue={settings.maxNewCardsPerDay}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-secondary-foreground">
          Número máximo de tarjetas nuevas que quieres estudiar cada día
        </p>
      </div>

      <div>
        <label htmlFor="maxReviewsPerDay" className="block text-sm font-medium text-primary">
          Repasos por día
        </label>
        <input
          id="maxReviewsPerDay"
          name="maxReviewsPerDay"
          type="number"
          min="1"
          max="2000"
          required
          defaultValue={settings.maxReviewsPerDay}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-secondary-foreground">
          Número máximo de repasos que quieres hacer cada día
        </p>
      </div>

      <div>
        <label htmlFor="dailyStudyGoalMinutes" className="block text-sm font-medium text-primary">
          Objetivo diario (minutos)
        </label>
        <input
          id="dailyStudyGoalMinutes"
          name="dailyStudyGoalMinutes"
          type="number"
          min="1"
          max="480"
          required
          defaultValue={settings.dailyStudyGoalMinutes}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-secondary-foreground">
          Tiempo objetivo de estudio diario en minutos
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? "Guardando..." : "Guardar Cambios"}
      </button>
    </form>
  );
}
