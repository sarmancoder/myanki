"use client";

import { useState } from "react";
import { z } from "zod";
import {
  DEFAULT_INITIAL_EASE_FACTOR,
  DEFAULT_LEARNING_STEPS,
  DEFAULT_MAX_INTERVAL_DAYS,
  DEFAULT_MINIMUM_EASE_FACTOR,
  DEFAULT_RELEARNING_STEPS,
  MAX_INITIAL_EASE_FACTOR,
  MAX_MAX_INTERVAL_DAYS,
  MAX_STEPS,
  MAX_STEP_MINUTES,
  MIN_EASE_FACTOR,
  MIN_INITIAL_EASE_FACTOR,
  MIN_MAX_INTERVAL_DAYS,
  MIN_STEP_MINUTES,
  SRS_ALGORITHM_HINTS,
  SRS_ALGORITHM_LABELS,
  SRS_ALGORITHMS,
  type SrsAlgorithm,
} from "@/constants/srs";
import { updateSrsSettingsAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import type { SrsSettingsView } from "@/types/srs";

/**
 * Los pasos llegan del formulario como texto ("1 10") porque el usuario escribe
 * una lista corta; el esquema compartido se encarga de validar cada número.
 */
const stepsTextSchema = z
  .string()
  .trim()
  .min(1, "Escribe al menos un paso en minutos")
  .transform((value) => value.split(/[\s,]+/).filter(Boolean).map(Number))
  .refine(
    (steps) => steps.length > 0 && steps.every((step) => Number.isInteger(step)),
    { error: `Usa números enteros separados por espacios (por ejemplo "1 10")` }
  )
  .refine(
    (steps) =>
      steps.every((step) => step >= MIN_STEP_MINUTES && step <= MAX_STEP_MINUTES) &&
      steps.length <= MAX_STEPS,
    {
      error: `Cada paso debe estar entre ${MIN_STEP_MINUTES} y ${MAX_STEP_MINUTES} minutos, con un máximo de ${MAX_STEPS} pasos`,
    }
  )
  .refine((steps) => steps.every((step, index) => index === 0 || step > steps[index - 1]), {
    error: "Los pasos deben ir de menor a mayor y sin repeticiones",
  });

const srsSettingsFormSchema = z.object({
  algorithm: z.enum(SRS_ALGORITHMS, { error: "Selecciona un algoritmo válido" }),
  initialEaseFactor: z
    .number({ error: "El factor inicial debe ser un número" })
    .min(MIN_INITIAL_EASE_FACTOR, `No puede bajar de ${MIN_INITIAL_EASE_FACTOR.toFixed(2)}`)
    .max(MAX_INITIAL_EASE_FACTOR, `No puede subir de ${MAX_INITIAL_EASE_FACTOR.toFixed(2)}`),
  minimumEaseFactor: z
    .number({ error: "El factor mínimo debe ser un número" })
    .min(MIN_EASE_FACTOR, `El factor de facilidad nunca baja de ${MIN_EASE_FACTOR.toFixed(2)}`),
  maxIntervalDays: z
    .number({ error: "El intervalo máximo debe ser un número" })
    .int("El intervalo máximo debe ser un número entero")
    .min(MIN_MAX_INTERVAL_DAYS, "Debe ser de al menos 1 día")
    .max(MAX_MAX_INTERVAL_DAYS, `No puede superar los ${MAX_MAX_INTERVAL_DAYS} días`),
});

const INPUT_CLASS =
  "block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-primary";
const ERROR_INPUT_CLASS = "border-red-500 focus:border-red-500 focus:ring-red-500";
const LABEL_CLASS = "block text-sm font-medium text-primary";

interface FieldErrorsProps {
  errors: string[] | undefined;
  id: string;
}

function FieldErrors({ errors, id }: FieldErrorsProps) {
  if (!errors || errors.length === 0) {
    return null;
  }

  return (
    <ul id={id} className="mt-1 space-y-0.5" role="alert">
      {errors.map((error) => (
        <li key={error} className="text-xs font-medium text-red-600">
          {error}
        </li>
      ))}
    </ul>
  );
}

interface SrsSettingsFormProps {
  settings: SrsSettingsView;
  onSuccess: (settings: SrsSettingsView) => void;
}

export default function SrsSettingsForm({ settings, onSuccess }: SrsSettingsFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const formData = new FormData(event.currentTarget);
    const errors: Record<string, string[]> = {};

    const learningSteps = stepsTextSchema.safeParse(String(formData.get("learningSteps") ?? ""));
    const relearningSteps = stepsTextSchema.safeParse(String(formData.get("relearningSteps") ?? ""));

    if (!learningSteps.success) {
      errors.learningSteps = learningSteps.error.issues.map((issue) => issue.message);
    }

    if (!relearningSteps.success) {
      errors.relearningSteps = relearningSteps.error.issues.map((issue) => issue.message);
    }

    // Los pasos ya validados se pasan tal cual: si su esquema falló, el error
    // está en `errors` y no se llega a la llamada.
    const parsedValues = {
      algorithm: String(formData.get("algorithm") ?? ""),
      initialEaseFactor: Number(formData.get("initialEaseFactor")),
      minimumEaseFactor: Number(formData.get("minimumEaseFactor")),
      maxIntervalDays: Number(formData.get("maxIntervalDays")),
    };

    const parsed = srsSettingsFormSchema.safeParse(parsedValues);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        errors[field] = [...(errors[field] ?? []), issue.message];
      }
    }

    if (Object.keys(errors).length > 0 || !parsed.success || !learningSteps.success || !relearningSteps.success) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsLoading(true);

    try {
      const result = await updateSrsSettingsAction({
        algorithm: parsed.data.algorithm as SrsAlgorithm,
        initialEaseFactor: parsed.data.initialEaseFactor,
        minimumEaseFactor: parsed.data.minimumEaseFactor,
        maxIntervalDays: parsed.data.maxIntervalDays,
        learningSteps: learningSteps.data,
        relearningSteps: relearningSteps.data,
      });

      if (isError(result)) {
        setFormError(getErrorMessage(result[1].message, "No se pudo guardar la configuración"));
        return;
      }

      if (isSuccess(result)) {
        onSuccess(result[0].settings);
        setSuccessMessage(
          "Configuración guardada. Se aplicará a las próximas calificaciones; las tarjetas ya programadas no se recalculan."
        );
      }
    } catch {
      setFormError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  }

  const hasError = (field: string) => (fieldErrors[field]?.length ?? 0) > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {formError && (
        <div className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {formError}
        </div>
      )}

      {successMessage && (
        <div
          className="rounded-lg border border-green-500 bg-green-50 p-3 text-sm text-green-700"
          role="status"
        >
          {successMessage}
        </div>
      )}

      <div>
        <label htmlFor="srs-algorithm" className={LABEL_CLASS}>
          Algoritmo de repetición
        </label>
        <select
          id="srs-algorithm"
          name="algorithm"
          defaultValue={settings.algorithm}
          aria-invalid={hasError("algorithm")}
          aria-describedby={hasError("algorithm") ? "srs-algorithm-errors" : "srs-algorithm-hint"}
          className={`mt-1 ${INPUT_CLASS} ${hasError("algorithm") ? ERROR_INPUT_CLASS : ""}`}
        >
          {SRS_ALGORITHMS.map((algorithm) => (
            <option key={algorithm} value={algorithm}>
              {SRS_ALGORITHM_LABELS[algorithm]}
            </option>
          ))}
        </select>
        <p id="srs-algorithm-hint" className="mt-1 text-xs text-secondary-foreground">
          {SRS_ALGORITHM_HINTS[settings.algorithm]}
        </p>
        <FieldErrors id="srs-algorithm-errors" errors={fieldErrors.algorithm} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="srs-initial-ease" className={LABEL_CLASS}>
            Factor de facilidad inicial
          </label>
          <input
            id="srs-initial-ease"
            name="initialEaseFactor"
            type="number"
            step="0.05"
            min={MIN_INITIAL_EASE_FACTOR}
            max={MAX_INITIAL_EASE_FACTOR}
            defaultValue={settings.initialEaseFactor}
            aria-invalid={hasError("initialEaseFactor")}
            aria-describedby={hasError("initialEaseFactor") ? "srs-initial-ease-errors" : "srs-initial-ease-hint"}
            className={`mt-1 ${INPUT_CLASS} ${hasError("initialEaseFactor") ? ERROR_INPUT_CLASS : ""}`}
          />
          <p id="srs-initial-ease-hint" className="mt-1 text-xs text-secondary-foreground">
            Con el que arrancan las tarjetas nuevas. Rango {MIN_INITIAL_EASE_FACTOR.toFixed(2)} –{" "}
            {MAX_INITIAL_EASE_FACTOR.toFixed(2)}.
          </p>
          <FieldErrors id="srs-initial-ease-errors" errors={fieldErrors.initialEaseFactor} />
        </div>

        <div>
          <label htmlFor="srs-minimum-ease" className={LABEL_CLASS}>
            Factor de facilidad mínimo
          </label>
          <input
            id="srs-minimum-ease"
            name="minimumEaseFactor"
            type="number"
            step="0.05"
            min={MIN_EASE_FACTOR}
            defaultValue={settings.minimumEaseFactor}
            aria-invalid={hasError("minimumEaseFactor")}
            aria-describedby={
              hasError("minimumEaseFactor") ? "srs-minimum-ease-errors" : "srs-minimum-ease-hint"
            }
            className={`mt-1 ${INPUT_CLASS} ${hasError("minimumEaseFactor") ? ERROR_INPUT_CLASS : ""}`}
          />
          <p id="srs-minimum-ease-hint" className="mt-1 text-xs text-secondary-foreground">
            Suelo del factor de facilidad: ninguna tarjeta baja de{" "}
            {MIN_EASE_FACTOR.toFixed(2)}, aunque se suspenda muchas veces.
          </p>
          <FieldErrors id="srs-minimum-ease-errors" errors={fieldErrors.minimumEaseFactor} />
        </div>
      </div>

      <div>
        <label htmlFor="srs-max-interval" className={LABEL_CLASS}>
          Intervalo máximo (días)
        </label>
        <input
          id="srs-max-interval"
          name="maxIntervalDays"
          type="number"
          step="1"
          min={MIN_MAX_INTERVAL_DAYS}
          max={MAX_MAX_INTERVAL_DAYS}
          defaultValue={settings.maxIntervalDays}
          aria-invalid={hasError("maxIntervalDays")}
          aria-describedby={hasError("maxIntervalDays") ? "srs-max-interval-errors" : "srs-max-interval-hint"}
          className={`mt-1 ${INPUT_CLASS} ${hasError("maxIntervalDays") ? ERROR_INPUT_CLASS : ""}`}
        />
        <p id="srs-max-interval-hint" className="mt-1 text-xs text-secondary-foreground">
          Ninguna tarjeta se programa más lejos de este límite. Por defecto 365 días (un año).
        </p>
        <FieldErrors id="srs-max-interval-errors" errors={fieldErrors.maxIntervalDays} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="srs-learning-steps" className={LABEL_CLASS}>
            Pasos de aprendizaje (minutos)
          </label>
          <input
            id="srs-learning-steps"
            name="learningSteps"
            type="text"
            inputMode="numeric"
            defaultValue={settings.learningSteps.join(" ")}
            placeholder={DEFAULT_LEARNING_STEPS.join(" ")}
            aria-invalid={hasError("learningSteps")}
            aria-describedby={hasError("learningSteps") ? "srs-learning-steps-errors" : "srs-learning-steps-hint"}
            className={`mt-1 ${INPUT_CLASS} ${hasError("learningSteps") ? ERROR_INPUT_CLASS : ""}`}
          />
          <p id="srs-learning-steps-hint" className="mt-1 text-xs text-secondary-foreground">
            Escalera de la tarjeta nueva: de menor a mayor, separados por espacios.
          </p>
          <FieldErrors id="srs-learning-steps-errors" errors={fieldErrors.learningSteps} />
        </div>

        <div>
          <label htmlFor="srs-relearning-steps" className={LABEL_CLASS}>
            Pasos de reaprendizaje (minutos)
          </label>
          <input
            id="srs-relearning-steps"
            name="relearningSteps"
            type="text"
            inputMode="numeric"
            defaultValue={settings.relearningSteps.join(" ")}
            placeholder={DEFAULT_RELEARNING_STEPS.join(" ")}
            aria-invalid={hasError("relearningSteps")}
            aria-describedby={
              hasError("relearningSteps") ? "srs-relearning-steps-errors" : "srs-relearning-steps-hint"
            }
            className={`mt-1 ${INPUT_CLASS} ${hasError("relearningSteps") ? ERROR_INPUT_CLASS : ""}`}
          />
          <p id="srs-relearning-steps-hint" className="mt-1 text-xs text-secondary-foreground">
            Escalera tras suspender un repaso: el primer paso marca cuánto tarda en reaparecer.
          </p>
          <FieldErrors id="srs-relearning-steps-errors" errors={fieldErrors.relearningSteps} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-secondary/40 p-4 text-xs text-secondary-foreground">
        <p className="font-medium text-primary">Valores por defecto de la especificación</p>
        <p className="mt-1">
          SM-2 · factor inicial {DEFAULT_INITIAL_EASE_FACTOR.toFixed(2)} · mínimo{" "}
          {DEFAULT_MINIMUM_EASE_FACTOR.toFixed(2)} · intervalo máximo {DEFAULT_MAX_INTERVAL_DAYS} días ·
          aprendizaje {DEFAULT_LEARNING_STEPS.join(" → ")} min · reaprendizaje{" "}
          {DEFAULT_RELEARNING_STEPS.join(" → ")} min.
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? "Guardando..." : "Guardar configuración"}
      </button>
    </form>
  );
}