"use client";

import { useState } from "react";

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
  const [maxNewCards, setMaxNewCards] = useState(settings.maxNewCardsPerDay);
  const [maxReviews, setMaxReviews] = useState(settings.maxReviewsPerDay);
  const [dailyGoal, setDailyGoal] = useState(settings.dailyStudyGoalMinutes);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/users/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxNewCardsPerDay: maxNewCards,
          maxReviewsPerDay: maxReviews,
          dailyStudyGoalMinutes: dailyGoal,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Error al actualizar" });
        return;
      }

      onUpdate(data.settings);
      setMessage({ type: "success", text: "Preferencias actualizadas correctamente" });
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
        <label htmlFor="maxNewCards" className="block text-sm font-medium text-primary">
          Tarjetas nuevas por día
        </label>
        <input
          id="maxNewCards"
          type="number"
          min="1"
          max="500"
          required
          value={maxNewCards}
          onChange={(e) => setMaxNewCards(Number(e.target.value))}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-secondary-foreground">
          Número máximo de tarjetas nuevas que quieres estudiar cada día
        </p>
      </div>

      <div>
        <label htmlFor="maxReviews" className="block text-sm font-medium text-primary">
          Repasos por día
        </label>
        <input
          id="maxReviews"
          type="number"
          min="1"
          max="2000"
          required
          value={maxReviews}
          onChange={(e) => setMaxReviews(Number(e.target.value))}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-secondary-foreground">
          Número máximo de repasos que quieres hacer cada día
        </p>
      </div>

      <div>
        <label htmlFor="dailyGoal" className="block text-sm font-medium text-primary">
          Objetivo diario (minutos)
        </label>
        <input
          id="dailyGoal"
          type="number"
          min="1"
          max="480"
          required
          value={dailyGoal}
          onChange={(e) => setDailyGoal(Number(e.target.value))}
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
