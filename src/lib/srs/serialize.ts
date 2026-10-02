import type { Prisma } from "@prisma/client";
import { toNumber } from "@/lib/cards/serialize";
import {
  calculateNextSchedule,
  formatInterval,
  normalizeSteps,
  type SrsScheduleResult,
  type SrsScheduleSettings,
  type SrsScheduleState,
} from "@/lib/srs/algorithm";
import {
  DEFAULT_INITIAL_EASE_FACTOR,
  DEFAULT_LEARNING_STEPS,
  DEFAULT_MAX_INTERVAL_DAYS,
  DEFAULT_MINIMUM_EASE_FACTOR,
  DEFAULT_RELEARNING_STEPS,
  MAX_INITIAL_EASE_FACTOR,
  MAX_STEPS,
  MIN_EASE_FACTOR,
  isSrsAlgorithm,
  type SrsRating,
} from "@/constants/srs";
import { isCardStatus } from "@/constants/cards";
import { elapsedDays } from "@/lib/srs/dates";
import type { SrsSettingsView } from "@/types/srs";

/** Fila de `srs_settings` tal y como la devuelve Prisma (`Decimal` incluido). */
export type SrsSettingsRow = Prisma.SrsSettingsGetPayload<Record<string, never>>;

/**
 * Traduce la fila de `srs_settings` a la configuración que consume el
 * algoritmo. Un valor desconocido (por ejemplo escrito a mano en la base de
 * datos) cae al algoritmo por defecto en lugar de romper el cálculo.
 */
export function toSrsScheduleSettings(row: SrsSettingsRow): SrsScheduleSettings {
  return {
    algorithm: isSrsAlgorithm(row.algorithm) ? row.algorithm : "sm2",
    initialEaseFactor: toNumber(row.initialEaseFactor) || DEFAULT_INITIAL_EASE_FACTOR,
    minimumEaseFactor: Math.max(
      toNumber(row.minimumEaseFactor) || DEFAULT_MINIMUM_EASE_FACTOR,
      MIN_EASE_FACTOR
    ),
    maxIntervalDays: toNumber(row.maxIntervalDays) || DEFAULT_MAX_INTERVAL_DAYS,
    learningSteps: normalizeSteps(row.learningSteps, DEFAULT_LEARNING_STEPS).slice(0, MAX_STEPS),
    relearningSteps: normalizeSteps(row.relearningSteps, DEFAULT_RELEARNING_STEPS).slice(0, MAX_STEPS),
  };
}

export function toSrsSettingsView(row: SrsSettingsRow): SrsSettingsView {
  const settings = toSrsScheduleSettings(row);

  return {
    algorithm: settings.algorithm,
    initialEaseFactor: Math.min(settings.initialEaseFactor, MAX_INITIAL_EASE_FACTOR),
    minimumEaseFactor: settings.minimumEaseFactor,
    maxIntervalDays: settings.maxIntervalDays,
    learningSteps: settings.learningSteps,
    relearningSteps: settings.relearningSteps,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Subconjunto de `card_scheduling` que necesita el algoritmo. */
export interface RawSchedulingState {
  status: string;
  /** `Decimal` de Prisma o número, según el origen de la fila. */
  easeFactor: DecimalLike;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: Date | null;
}

type DecimalLike = { toNumber(): number } | number | string | null | undefined;

/**
 * Normaliza `card_scheduling` al estado del algoritmo.
 *
 * `elapsedDays` solo importa para FSRS: en SM-2 el intervalo se deriva del
 * factor de facilidad. En learning/relearning `interval_days` guarda los minutos
 * del paso de la escalera en lugar de días.
 */
export function toScheduleState(
  scheduling: RawSchedulingState | null,
  now: Date = new Date()
): SrsScheduleState {
  return {
    status: scheduling && isCardStatus(scheduling.status) ? scheduling.status : "new",
    easeFactor: scheduling ? toNumber(scheduling.easeFactor) : 0,
    intervalDays: Math.max(toNumber(scheduling?.intervalDays), 0),
    repetitions: scheduling?.repetitions ?? 0,
    lapses: scheduling?.lapses ?? 0,
    elapsedDays: elapsedDays(scheduling?.lastReviewedAt, now),
  };
}

/**
 * Aplica una calificación a un estado normalizado y devuelve tanto el resultado
 * del algoritmo como la etiqueta lista para pintar en el botón (RF-008).
 */
export function scheduleWithLabel(
  state: SrsScheduleState,
  rating: SrsRating,
  settings: SrsScheduleSettings,
  now: Date = new Date()
): SrsScheduleResult & { intervalLabel: string } {
  const result = calculateNextSchedule(state, rating, settings, now);

  return {
    ...result,
    intervalLabel: formatInterval(result.delayMinutes, result.intervalDays),
  };
}

/**
 * `card_scheduling.due_date` es una columna DATE, así que el retraso intradía se
 * guarda como el día en que vuelve a tocar. El módulo de estudio (spec 05) usa
 * el `dueDate` exacto que devuelve `srs.review` para ordenar la cola de
 * aprendizaje con precisión de minutos.
 */
export function toStoredDueDate(result: SrsScheduleResult): Date {
  return new Date(
    Date.UTC(result.dueDate.getUTCFullYear(), result.dueDate.getUTCMonth(), result.dueDate.getUTCDate())
  );
}