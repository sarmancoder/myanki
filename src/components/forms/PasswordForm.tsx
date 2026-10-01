"use client";

import { useState } from "react";
import { changePasswordAction } from "@/server/actions";
import { isError } from "@/lib/orpc";

export default function PasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const currentPassword = formData.get("currentPassword") as string;
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Las contraseñas no coinciden" });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "La contraseña debe tener al menos 8 caracteres" });
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setMessage({ type: "error", text: "La contraseña debe contener al menos una mayúscula" });
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setMessage({ type: "error", text: "La contraseña debe contener al menos una minúscula" });
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setMessage({ type: "error", text: "La contraseña debe contener al menos un número" });
      return;
    }

    setIsLoading(true);

    try {
      const result = await changePasswordAction({ currentPassword, newPassword });

      if (isError(result)) {
        setMessage({ type: "error", text: result[1].message || "Error al cambiar contraseña" });
        setIsLoading(false);
        return;
      }

      setMessage({ type: "success", text: "Contraseña cambiada correctamente" });
      event.currentTarget.reset();
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
        <label htmlFor="currentPassword" className="block text-sm font-medium text-primary">
          Contraseña actual
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="block text-sm font-medium text-primary">
          Nueva contraseña
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-secondary">
          Mínimo 8 caracteres, una mayúscula, una minúscula y un número
        </p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-primary">
          Confirmar nueva contraseña
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? "Cambiando..." : "Cambiar Contraseña"}
      </button>
    </form>
  );
}
