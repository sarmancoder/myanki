"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerAction } from "@/server/actions";
import { isSuccess, isError } from "@/lib/orpc";

export default function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      setIsLoading(false);
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError("La contraseña debe contener al menos una mayúscula");
      setIsLoading(false);
      return;
    }

    if (!/[a-z]/.test(password)) {
      setError("La contraseña debe contener al menos una minúscula");
      setIsLoading(false);
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError("La contraseña debe contener al menos un número");
      setIsLoading(false);
      return;
    }

    try {
      const result = await registerAction({ email, password, name });

      if (isError(result)) {
        setError(result[1].message || "Error al registrar");
        setIsLoading(false);
        return;
      }

      router.push("/login?registered=true");
    } catch (err) {
      setError("Error al registrar. Intenta de nuevo.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-primary">
          Nombre
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary placeholder:text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Tu nombre"
        />
      </div>

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

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-primary">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary placeholder:text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="••••••••"
        />
        <p className="mt-1 text-xs text-secondary">
          Mínimo 8 caracteres, una mayúscula, una minúscula y un número
        </p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-primary">
          Confirmar Contraseña
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary placeholder:text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? "Creando cuenta..." : "Crear Cuenta"}
      </button>
    </form>
  );
}
