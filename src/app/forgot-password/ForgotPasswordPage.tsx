"use client";

import { useState } from "react";
import Link from "next/link";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(email: string) {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (response.ok) {
      setIsSubmitted(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">Recuperar Contraseña</h1>
          <p className="mt-2 text-secondary">
            Ingresa tu email para recibir un enlace de recuperación
          </p>
        </div>

        {isSubmitted ? (
          <div className="rounded-lg border border-green-500 bg-green-50 p-4 text-green-700">
            <p className="font-medium">Email enviado</p>
            <p className="mt-1 text-sm">
              Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
            </p>
          </div>
        ) : (
          <ForgotPasswordForm onSubmit={handleSubmit} />
        )}

        <div className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
