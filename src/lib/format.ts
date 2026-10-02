import type { LanguageRef } from "@/types/language";

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("es-ES");

/**
 * Formatea una fecha ISO en UTC para que el renderizado del servidor y el del
 * cliente coincidan siempre (sin diferencias de zona horaria).
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return dateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return dateTimeFormatter.format(date);
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Duración en formato de reloj: `M:SS` por debajo de una hora y `H:MM:SS` a partir
 * de ahí. Es lo que muestra el temporizador de la sesión de estudio (RF-014).
 */
export function formatDuration(milliseconds: number): string {
  const safe = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;
  const totalSeconds = Math.floor(safe / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);

  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours === 0) {
    return `${minutes}:${paddedSeconds}`;
  }

  return `${hours}:${String(minutes % 60).padStart(2, "0")}:${paddedSeconds}`;
}

/** Duración legible en texto: "45 s", "12 min", "1 h 20 min". */
export function formatDurationText(milliseconds: number): string {
  const safe = Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : 0;

  if (safe < 60_000) {
    return `${Math.max(1, Math.round(safe / 1000))} s`;
  }

  if (safe < 3_600_000) {
    return `${Math.round(safe / 60_000)} min`;
  }

  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.round((safe % 3_600_000) / 60_000);

  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** Porcentaje con un decimal solo si hace falta ("80%" o "66,7%"). */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");

  return `${text}%`;
}

/**
 * Nombre de un idioma con su bandera delante, tal y como se muestra en los
 * selectores y en las etiquetas que lo mencionan: "🇫🇷 Francés".
 */
export function formatLanguageName(language: LanguageRef | null | undefined): string {
  if (!language) {
    return "";
  }

  return `${language.flag ? `${language.flag} ` : ""}${language.name}`;
}