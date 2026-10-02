"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { startStudySessionAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { formatNumber } from "@/lib/format";

const launchFormSchema = z.object({
  deckId: z.string().uuid("Mazo no válido"),
  includeSubdecks: z.boolean(),
  isCramMode: z.boolean(),
});

const CHECKBOX_CLASS = "h-4 w-4 rounded border-border text-primary focus:ring-primary";

interface StudyDeckLaunchFormProps {
  deckId: string;
  deckName: string;
  /** Tarjetas del mazo, sin sub-mazos. */
  cardCount: number;
  /** Tarjetas del mazo y de sus sub-mazos. */
  branchTotalCards: number;
  subDeckCount: number;
  hasSubDecks: boolean;
}

/**
 * Arranque de la sesión de un mazo (RF-001). No hay cupos ni número máximo de
 * tarjetas: se estudia el mazo entero tantas veces como se quiera. Es uncontrolled:
 * los valores viajan en el `FormData` y se validan en el cliente antes de llamar a
 * la acción.
 */
export default function StudyDeckLaunchForm({
  deckId,
  deckName,
  cardCount,
  branchTotalCards,
  subDeckCount,
  hasSubDecks,
}: StudyDeckLaunchFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCards = cardCount > 0;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formRef.current || isBusy) {
      return;
    }

    const formData = new FormData(formRef.current);

    const parsed = launchFormSchema.safeParse({
      deckId: String(formData.get("deckId") ?? ""),
      includeSubdecks: formData.get("includeSubdecks") === "on",
      isCramMode: formData.get("isCramMode") === "on",
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa el mazo seleccionado.");
      return;
    }

    setError(null);
    setIsBusy(true);

    try {
      const result = await startStudySessionAction(parsed.data);

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo iniciar la sesión"));
        return;
      }

      if (isSuccess(result)) {
        // Sin tarjetas en la cola no hay sesión: solo se avisa para que el usuario
        // sepa que tiene que añadir tarjetas al mazo.
        if (result[0].isEmpty || !result[0].session) {
          setError(
            hasSubDecks
              ? "No hay tarjetas que estudiar en este mazo ni en sus sub-mazos."
              : "Este mazo todavía no tiene tarjetas."
          );
          return;
        }

        router.push(`/study/session/${result[0].session.id}`);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-4 rounded-lg border border-border bg-background p-5"
    >
      {error && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <input type="hidden" name="deckId" value={deckId} />

      <div>
        <h2 className="text-sm font-semibold text-primary">Estudiar {deckName}</h2>
        <p className="mt-1 text-sm text-secondary-foreground">
          {formatNumber(hasSubDecks ? branchTotalCards : cardCount)} tarjeta
          {(hasSubDecks ? branchTotalCards : cardCount) === 1 ? "" : "s"} en esta sesión, empezando por
          las que menos has estudiado. Sin límite de sesiones ni de tarjetas.
        </p>
      </div>

      <div className="flex flex-wrap gap-6">
        {hasSubDecks && (
          <label className="flex items-center gap-2 text-sm text-primary">
            <input
              type="checkbox"
              name="includeSubdecks"
              defaultChecked
              className={CHECKBOX_CLASS}
            />
            Incluir los {formatNumber(subDeckCount)} sub-mazo{subDeckCount === 1 ? "" : "s"}
          </label>
        )}

        <label className="flex items-center gap-2 text-sm text-primary">
          <input type="checkbox" name="isCramMode" className={CHECKBOX_CLASS} />
          Modo repaso (no cambia las fechas)
        </label>
      </div>

      <button
        type="submit"
        disabled={isBusy || !hasCards}
        className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isBusy ? "Preparando la sesión..." : "Estudiar"}
      </button>

      {!hasCards && (
        <span className="text-xs text-secondary-foreground">
          Este mazo no tiene tarjetas. Crea o importa alguna para poder estudiarlo.
        </span>
      )}
    </form>
  );
}