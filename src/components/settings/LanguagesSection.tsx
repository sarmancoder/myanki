"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import LanguageForm from "@/components/forms/LanguageForm";
import {
  deleteLanguageAction,
  listLanguagesAction,
  updateLanguageAction,
} from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import type { LanguageView } from "@/types/language";

interface LanguagesSectionProps {
  /** Catálogo que ya viene cargado por la página, para no esperarlo en el pintado. */
  initialLanguages: LanguageView[];
}

interface Toast {
  type: "success" | "error";
  text: string;
}

const GHOST_BUTTON_CLASS =
  "rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-40";

export default function LanguagesSection({ initialLanguages }: LanguagesSectionProps) {
  const router = useRouter();
  const [languages, setLanguages] = useState<LanguageView[]>(initialLanguages);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const reload = useCallback(async () => {
    const result = await listLanguagesAction();

    if (isSuccess(result)) {
      setLanguages(result[0].languages);
    }
  }, []);

  function handleCreated(language: LanguageView) {
    setToast({ type: "success", text: `Idioma "${language.name}" añadido` });
    reload();
    // El filtro de la página de estudio y el selector de mazos dependen del catálogo.
    router.refresh();
  }

  function handleUpdated(language: LanguageView) {
    setEditingId(null);
    setToast({ type: "success", text: `Idioma "${language.name}" guardado` });
    reload();
    router.refresh();
  }

  async function handleMove(language: LanguageView, direction: -1 | 1) {
    const index = languages.findIndex((item) => item.id === language.id);
    const target = languages[index + direction];

    if (!target) {
      return;
    }

    // Intercambiar el orden de los dos vecinos es más simple que reindexar todo y
    // evita que dos filas compartan `sortOrder`.
    setBusyId(language.id);

    const results = await Promise.all([
      updateLanguageAction({ id: language.id, sortOrder: target.sortOrder }),
      updateLanguageAction({ id: target.id, sortOrder: language.sortOrder }),
    ]);

    setBusyId(null);

    const [first, second] = results;

    for (const result of [first, second]) {
      if (isError(result)) {
        setToast({
          type: "error",
          text: getErrorMessage(result[1].message, "No se pudo reordenar"),
        });
        return;
      }
    }

    reload();
  }

  async function handleDelete(language: LanguageView) {
    if (language.deckCount > 0) {
      setToast({
        type: "error",
        text: `No se puede eliminar "${language.name}" porque ${language.deckCount} mazo${
          language.deckCount === 1 ? "" : "s"
        } lo usa${language.deckCount === 1 ? "" : "n"}.`,
      });
      return;
    }

    if (!confirm(`¿Eliminar el idioma "${language.name}"?`)) {
      return;
    }

    setBusyId(language.id);
    const result = await deleteLanguageAction({ id: language.id });
    setBusyId(null);

    if (isError(result)) {
      setToast({
        type: "error",
        text: getErrorMessage(result[1].message, "No se pudo eliminar el idioma"),
      });
      return;
    }

    setToast({ type: "success", text: `Idioma "${language.name}" eliminado` });
    reload();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-primary">Idiomas</h2>
        <p className="mt-1 text-sm text-secondary-foreground">
          Tu catálogo de idiomas. Cada mazo tiene un idioma, y en Estudio y en Mis mazos puedes
          filtrar por él. Añade los que necesites: no hay una lista cerrada.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-sm font-semibold text-primary">Añadir un idioma</h3>
        <LanguageForm mode="create" onSuccess={handleCreated} />
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
        {languages.map((language, index) => (
          <li key={language.id} className="px-4 py-3">
            {editingId === language.id ? (
              <LanguageForm
                mode="edit"
                initialValues={{
                  id: language.id,
                  name: language.name,
                  flag: language.flag ?? "",
                }}
                submitLabel="Guardar"
                onSuccess={handleUpdated}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
                    <span aria-hidden="true">{language.flag}</span>
                    {language.name}
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-normal text-secondary-foreground">
                      {language.code}
                    </span>
                  </p>
                  <p className="text-xs text-secondary-foreground">
                    {language.deckCount === 1
                      ? "1 mazo lo usa"
                      : `${language.deckCount} mazos lo usan`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleMove(language, -1)}
                    disabled={index === 0 || busyId === language.id}
                    aria-label={`Subir ${language.name}`}
                    title="Subir"
                    className={GHOST_BUTTON_CLASS}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(language, 1)}
                    disabled={index === languages.length - 1 || busyId === language.id}
                    aria-label={`Bajar ${language.name}`}
                    title="Bajar"
                    className={GHOST_BUTTON_CLASS}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(language.id)}
                    disabled={busyId === language.id}
                    className={GHOST_BUTTON_CLASS}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(language)}
                    disabled={busyId === language.id}
                    className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {toast && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${
            toast.type === "success"
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-red-500 bg-red-50 text-red-700"
          }`}
          role="status"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}