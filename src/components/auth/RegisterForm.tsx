"use client";

import { useState } from "react";

interface RegisterFormProps {
  onSubmit: (email: string, password: string, name: string) => Promise<void>;
}

export default function RegisterForm({ onSubmit }: RegisterFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (password !== confirmPassword) {
      setValidationError("Las contraseñas no coinciden");
      return;
    }

    if (password.length < 8) {
      setValidationError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setValidationError("La contraseña debe contener al menos una mayúscula");
      return;
    }

    if (!/[a-z]/.test(password)) {
      setValidationError("La contraseña debe contener al menos una minúscula");
      return;
    }

    if (!/[0-9]/.test(password)) {
      setValidationError("La contraseña debe contener al menos un número");
      return;
    }

    setIsLoading(true);
    try {
      await onSubmit(email, password, name);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {validationError && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-4 text-red-700">
          {validationError}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-primary">
          Nombre
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
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
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
