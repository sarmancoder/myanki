"use client";

import { useState } from "react";
import { forgotPasswordAction } from "@/server/actions";
import { isError } from "@/lib/orpc";

export default function ForgotPasswordForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;

    try {
      const result = await forgotPasswordAction({ email });

      if (isError(result)) {
        setError(result[1].message || "Error al enviar el email");
        setIsLoading(false);
        return;
      }

      setIsSubmitted(true);
    } catch {
      setError("Error al enviar el email. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="rounded-lg border border-green-500 bg-green-50 p-4 text-green-700">
        <p className="font-medium">Email enviado</p>
        <p className="mt-1 text-sm">
          Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-primary">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary placeholder:text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="tu@email.com"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? "Enviando..." : "Enviar Enlace"}
      </button>
    </form>
  );
}
