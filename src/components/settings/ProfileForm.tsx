"use client";

import { useState } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  preferredLang: string;
  emailVerified: boolean;
}

interface ProfileFormProps {
  user: User;
  onUpdate: (user: User) => void;
}

export default function ProfileForm({ user, onUpdate }: ProfileFormProps) {
  const [name, setName] = useState(user.name);
  const [preferredLang, setPreferredLang] = useState(user.preferredLang);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, preferredLang }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "Error al actualizar" });
        return;
      }

      onUpdate(data.user);
      setMessage({ type: "success", text: "Perfil actualizado correctamente" });
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
        <label className="block text-sm font-medium text-primary">Email</label>
        <input
          type="email"
          value={user.email}
          disabled
          className="mt-1 block w-full rounded-lg border border-border bg-secondary px-4 py-3 text-secondary-foreground"
        />
        {!user.emailVerified && (
          <p className="mt-1 text-xs text-yellow-600">
            Email no verificado
          </p>
        )}
      </div>

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
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor="language" className="block text-sm font-medium text-primary">
          Idioma de la interfaz
        </label>
        <select
          id="language"
          value={preferredLang}
          onChange={(e) => setPreferredLang(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-border bg-background px-4 py-3 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
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
