"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import ProfileForm from "@/components/forms/ProfileForm";
import SettingsForm from "@/components/forms/SettingsForm";
import PasswordForm from "@/components/forms/PasswordForm";
import LanguagesSection from "@/components/settings/LanguagesSection";
import {
  meAction,
  getSettingsAction,
  deleteAccountAction,
  listLanguagesAction,
} from "@/server/actions";
import { isSuccess } from "@/lib/orpc";
import type { LanguageView } from "@/types/language";

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  preferredLang: string;
  emailVerified?: boolean;
}

interface Settings {
  maxNewCardsPerDay: number;
  maxReviewsPerDay: number;
  dailyStudyGoalMinutes: number;
}

type SettingsTab = "profile" | "settings" | "password" | "languages";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [languages, setLanguages] = useState<LanguageView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  useEffect(() => {
    async function fetchData() {
      try {
        const [userResult, settingsResult, languagesResult] = await Promise.all([
          meAction(),
          getSettingsAction(),
          listLanguagesAction(),
        ]);

        if (isSuccess(userResult)) {
          setUser(userResult[0].user);
        }

        if (isSuccess(settingsResult)) {
          setSettings(settingsResult[0].settings);
        }

        if (isSuccess(languagesResult)) {
          setLanguages(languagesResult[0].languages);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  }

  async function handleDeleteAccount() {
    if (!confirm("¿Estás seguro de que quieres eliminar tu cuenta? Esta acción no se puede deshacer.")) {
      return;
    }

    const result = await deleteAccountAction();

    if (isSuccess(result)) {
      await signOut({ redirect: false });
      router.push("/login");
      router.refresh();
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-primary">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-red-500">Error al cargar el perfil</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-primary">Configuración</h1>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-border px-4 py-2 text-primary transition-colors hover:bg-secondary"
          >
            Cerrar Sesión
          </button>
        </div>

        <div className="mb-6 flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab("profile")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "profile"
                ? "border-b-2 border-primary text-primary"
                : "text-secondary-foreground hover:text-primary"
            }`}
          >
            Perfil
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "settings"
                ? "border-b-2 border-primary text-primary"
                : "text-secondary-foreground hover:text-primary"
            }`}
          >
            Preferencias
          </button>
          <button
            onClick={() => setActiveTab("languages")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "languages"
                ? "border-b-2 border-primary text-primary"
                : "text-secondary-foreground hover:text-primary"
            }`}
          >
            Idiomas
          </button>
          <button
            onClick={() => setActiveTab("password")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "password"
                ? "border-b-2 border-primary text-primary"
                : "text-secondary-foreground hover:text-primary"
            }`}
          >
            Contraseña
          </button>
        </div>

        <div className="rounded-lg border border-border bg-background p-6">
          {activeTab === "profile" && (
            <ProfileForm user={user} onUpdate={setUser} />
          )}
          {activeTab === "settings" && settings && (
            <SettingsForm settings={settings} onUpdate={setSettings} />
          )}
          {activeTab === "password" && <PasswordForm />}
          {activeTab === "languages" && <LanguagesSection initialLanguages={languages} />}
        </div>

        <div className="mt-6 rounded-lg border border-border bg-background p-6">
          <h2 className="text-lg font-semibold text-primary">Repetición espaciada</h2>
          <p className="mt-2 text-sm text-secondary-foreground">
            Configura el algoritmo (SM-2 o FSRS), el factor de facilidad, el intervalo máximo y las escaleras
            de aprendizaje.
          </p>
          <Link
            href="/settings/srs"
            className="mt-4 inline-block rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-secondary"
          >
            Abrir ajustes del algoritmo
          </Link>
        </div>

        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">Zona de Peligro</h2>
          <p className="mt-2 text-sm text-red-600">
            Eliminar tu cuenta es permanente y no se puede deshacer. Todos tus mazos, tarjetas y datos de estudio serán eliminados.
          </p>
          <button
            onClick={handleDeleteAccount}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700"
          >
            Eliminar Cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
