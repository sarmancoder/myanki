"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { startStudySessionAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { formatNumber } from "@/lib/format";
import {
  DEFAULT_STUDY_MAX_CARDS,
  MAX_STUDY_MAX_CARDS,
  MIN_STUDY_MAX_CARDS,
  STUDY_EARLY_DAY_LABELS,
  STUDY_EARLY_DAY_OPTIONS,
} from "@/constants/study";
import type { StudyDeckOption, StudyLimits, StudyQueueCounts } from "@/types/study";

const launchFormSchema = z.object({
  deckId: z.string(),
  includeSubdecks: z.boolean(),
  earlyDays: z.coerce
    .number()
    .int("Los días de adelanto deben ser un número entero")
    .min(0, "Los días de adelanto no pueden ser negativos")
    .max(
      Math.max(...STUDY_EARLY_DAY_OPTIONS),
      `El estudio anticipado llega como máximo ${Math.max(...STUDY_EARLY_DAY_OPTIONS)} días`
    ),
  isCramMode: z.boolean(),
  maxCards: z.coerce
    .number()
    .int("El número de tarjetas debe ser un entero")
    .min(MIN_STUDY_MAX_CARDS, `Estudia al menos ${MIN_STUDY_MAX_CARDS} tarjetas por sesión`)
    .max(MAX_STUDY_MAX_CARDS, `Estudia como máximo ${MAX_STUDY_MAX_CARDS} tarjetas por sesión`),
});

const INPUT_CLASS =
  "block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";
const LABEL_CLASS = "block text-sm font-medium text-primary";
const CHECKBOX_CLASS = "h-4 w-4 rounded border-border text-primary focus:ring-primary";

interface CountTileProps {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
}

function CountTile({ label, value, hint, accent = false }: CountTileProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-xs font-medium text-secondary-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-blue-600" : "text-primary"}`}>
        {formatNumber(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-secondary-foreground">{hint}</p>}
    </div>
  );
}

interface AllCaughtUpProps {
  upcoming: number;
  isCramMode: boolean;
  isBusy: boolean;
  onStart: (overrides: { earlyDays?: number; isCramMode?: boolean }) => void;
}

/**
 * RF-004: no hay nada pendiente. En lugar de una pantalla muerta, se ofrece
 * adelantar el estudio (RF-017) o repasar el mazo sin tocar el scheduling (RF-022).
 */
function AllCaughtUp({ upcoming, isCramMode, isBusy, onStart }: AllCaughtUpProps) {
  const [days, setDays] = useState(7);

  return (
    <section className="rounded-lg border border-green-500 bg-green-50 p-6">
      <h2 className="text-lg font-semibold text-green-800">¡Todo al día!</h2>
      <p className="mt-2 max-w-2xl text-sm text-green-900">
        No te queda ninguna tarjeta vencida en esta selección.
        {upcoming > 0 && ` Hay ${formatNumber(upcoming)} tarjeta(s) que vencen en los próximos 7 días.`}
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="early-days" className={LABEL_CLASS}>
            Adelantar el estudio
          </label>
          <select
            id="early-days"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            {STUDY_EARLY_DAY_OPTIONS.filter((option) => option > 0).map((option) => (
              <option key={option} value={option}>
                {STUDY_EARLY_DAY_LABELS[option]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={isBusy}
          onClick={() => onStart({ earlyDays: days })}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Estudiar las próximas
        </button>

        <button
          type="button"
          disabled={isBusy || isCramMode}
          onClick={() => onStart({ isCramMode: true })}
          className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          Repasar el mazo (sin scheduling)
        </button>
      </div>
    </section>
  );
}

interface StudyLaunchFormProps {
  decks: StudyDeckOption[];
  limits: StudyLimits;
  /** Contadores del mazo preseleccionado desde la URL. */
  initialCounts: StudyQueueCounts & { upcoming: number };
  /** Mazo preseleccionado (`?deck=<id>`). */
  initialDeckId: string | null;
}

/**
 * Formulario de arranque del estudio (RF-001): mazo o "Todos los mazos", con
 * estudio anticipado (RF-017) y modo cram (RF-022). Es uncontrolled: los valores
 * viajan en el `FormData` y se validan en el cliente antes de llamar a la acción.
 */
export default function StudyLaunchForm({
  decks,
  limits,
  initialCounts,
  initialDeckId,
}: StudyLaunchFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(initialDeckId ?? "");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isCaughtUp, setIsCaughtUp] = useState(false);
  const [isCramMode, setIsCramMode] = useState(false);

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const counts = selectedDeck ? selectedDeck.counts : initialCounts;
  const upcoming = selectedDeck ? selectedDeck.upcoming : initialCounts.upcoming;
  const hasPending = counts.remaining > 0;

  async function start(overrides: { earlyDays?: number; isCramMode?: boolean } = {}) {
    if (!formRef.current) {
      return;
    }

    const formData = new FormData(formRef.current);
    const values = {
      deckId: String(formData.get("deckId") ?? ""),
      includeSubdecks: formData.get("includeSubdecks") === "on",
      earlyDays: formData.get("earlyDays") ?? 0,
      isCramMode: (formData.get("isCramMode") === "on" && !overrides.isCramMode) || Boolean(overrides.isCramMode),
      maxCards: formData.get("maxCards") ?? DEFAULT_STUDY_MAX_CARDS,
    };

    const parsed = launchFormSchema.safeParse(values);

    if (!parsed.success) {
      const errors: Record<string, string[]> = {};

      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        errors[field] = [...(errors[field] ?? []), issue.message];
      }

      setFieldErrors(errors);
      setError("Revisa los campos marcados antes de empezar.");
      return;
    }

    setFieldErrors({});
    setError(null);
    setIsBusy(true);

    try {
      const result = await startStudySessionAction({
        deckId: parsed.data.deckId,
        includeSubdecks: parsed.data.includeSubdecks,
        earlyDays: overrides.earlyDays ?? parsed.data.earlyDays,
        isCramMode: parsed.data.isCramMode,
        maxCards: parsed.data.maxCards,
      });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, "No se pudo iniciar la sesión"));
        return;
      }

      if (isSuccess(result)) {
        // RF-004: sin tarjetas en la cola no hay sesión; se ofrece estudiar antes.
        if (result[0].isEmpty || !result[0].session) {
          setIsCaughtUp(true);
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCaughtUp(false);
    void start();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CountTile label="Nuevas" value={counts.new} hint="Sin estudiar todavía" accent={counts.new > 0} />
        <CountTile label="En aprendizaje" value={counts.learning} hint="Pendientes de graduar" />
        <CountTile label="Repasos" value={counts.review} hint="Vencidos hoy" />
        <CountTile
          label="Total pendiente"
          value={counts.remaining}
          hint={selectedDeck ? `En ${selectedDeck.name}` : "En todos los mazos"}
          accent={counts.remaining > 0}
        />
      </section>

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5 rounded-lg border border-border bg-background p-6">
        {error && (
          <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="deck" className={LABEL_CLASS}>
            ¿Qué quieres estudiar?
          </label>
          <select
            id="deck"
            name="deckId"
            defaultValue={selectedDeckId}
            onChange={(event) => {
              setSelectedDeckId(event.target.value);
              setIsCaughtUp(false);
            }}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            <option value="">Todos los mazos ({formatNumber(initialCounts.remaining)})</option>
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {`${"— ".repeat(deck.depth - 1)}${deck.name} (${formatNumber(deck.counts.remaining)})`}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-secondary-foreground">
            Entre paréntesis, las tarjetas pendientes de cada mazo.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="early-days-select" className={LABEL_CLASS}>
              Antelación (RF-017)
            </label>
            <select
              id="early-days-select"
              name="earlyDays"
              className={`mt-1 ${INPUT_CLASS}`}
            >
              {STUDY_EARLY_DAY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STUDY_EARLY_DAY_LABELS[option]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-secondary-foreground">
              Adelanta el estudio de tarjetas que vencen en los próximos días. Al calificarlas se
              reprograman y no vuelven a salir hoy.
            </p>
          </div>

          <div>
            <label htmlFor="max-cards" className={LABEL_CLASS}>
              Tarjetas por sesión
            </label>
            <input
              id="max-cards"
              name="maxCards"
              type="number"
              min={MIN_STUDY_MAX_CARDS}
              max={MAX_STUDY_MAX_CARDS}
              defaultValue={DEFAULT_STUDY_MAX_CARDS}
              aria-invalid={Boolean(fieldErrors.maxCards)}
              className={`mt-1 ${INPUT_CLASS}`}
            />
            {fieldErrors.maxCards?.map((message) => (
              <p key={message} className="mt-1 text-xs font-medium text-red-600">
                {message}
              </p>
            ))}
            <p className="mt-1 text-xs text-secondary-foreground">
              Se respeta siempre el límite diario: {formatNumber(limits.newRemaining)} nuevas y{" "}
              {formatNumber(limits.reviewRemaining)} repasos te quedan hoy.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-primary">
            <input type="checkbox" name="includeSubdecks" defaultChecked className={CHECKBOX_CLASS} />
            Incluir los sub-mazos
          </label>

          <label className="flex items-center gap-2 text-sm text-primary">
            <input
              type="checkbox"
              name="isCramMode"
              checked={isCramMode}
              onChange={(event) => setIsCramMode(event.target.checked)}
              className={CHECKBOX_CLASS}
            />
            Modo repaso (ignora las fechas de vencimiento)
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isBusy}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isBusy ? "Preparando la sesión..." : "Empezar a estudiar"}
          </button>

          {!hasPending && !isCramMode && (
            <span className="text-xs text-secondary-foreground">
              No hay nada pendiente en esta selección: al empezar te ofereceré estudiar por adelantado.
            </span>
          )}
        </div>
      </form>

      {isCaughtUp && (
        <AllCaughtUp
          upcoming={upcoming}
          isCramMode={isCramMode}
          isBusy={isBusy}
          onStart={(overrides) => void start(overrides)}
        />
      )}
    </div>
  );
}