/**
 * Utilidades de fecha para el SRS. El proyecto trabaja con días UTC (misma
 * convención que `endOfTodayUtc` en el router de mazos) y `card_scheduling.due_date`
 * es una columna `DATE`, es decir, sin hora: los retardos intradía de los pasos
 * de aprendizaje no pueden guardarse con precisión y el módulo de estudio los
 * resuelve en memoria con el retardo en minutos que devuelve el cálculo.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUtcDay(date: Date): Date {
  return new Date(startOfUtcDay(date).getTime() + DAY_MS - 1);
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() + days * DAY_MS);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/** Días transcurridos desde `from` hasta `to`, con decimales (necesario para FSRS). */
export function elapsedDays(from: Date | null | undefined, to: Date = new Date()): number {
  if (!from) {
    return 0;
  }

  const diff = to.getTime() - new Date(from).getTime();

  return diff <= 0 ? 0 : diff / DAY_MS;
}