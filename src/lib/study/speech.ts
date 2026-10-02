/**
 * Pronunciación del anverso de la tarjeta.
 *
 * Se apoya en la Web Speech API del navegador, así que no hace falta ninguna clave
 * ni ningún servicio externo: la voz es la del sistema operativo. Cuando la
 * tarjeta ya tiene un audio subido, ese archivo tiene prioridad y este módulo no
 * llega a usarse.
 */

/** Longitud a partir de la cual el texto del anverso se recorta. */
export const SPEECH_MAX_CHARS = 180;

/** Tope del vídeo/texto largo: el anverso se dice entero salvo que sea enorme. */
const TRUNCATION_SUFFIX = "…";

/**
 * Limpia el markdown del anverso para que no se lea en voz alta: los asteriscos,
 * almohadillas, corchetes y barras de las tablas son ruido para el motor de voz.
 * El texto de una cloze se queda con el borrado (`[...]`) fuera, porque es
 * justamente la palabra que hay que recordar.
 */
function stripMarkdown(source: string): string {
  return source
    // Imágenes y enlaces: ![alt](url) -> alt, [texto](url) -> texto.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Bloques de código: se quedan con su contenido, sin las comillas.
    .replace(/```[a-zA-Z0-9]*\n?/g, " ")
    // Códigos en línea.
    .replace(/`([^`]*)`/g, "$1")
    // Encabezados y citas.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    // Negrita, cursiva y tachado.
    .replace(/(\*\*\*|___)(.*?)\1/g, "$2")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    // Listas y separadores.
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^\s*[-=|: ]{3,}\s*$/gm, " ")
    // HTML incrustado y entidades sueltas.
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Texto que se pronuncia al presentar la tarjeta. Devuelve cadena vacía cuando el
 * anverso no tiene nada legible, para no lanzar el motor de voz en balde.
 */
export function toSpeakableText(front: string): string {
  const text = stripMarkdown(front);

  if (text.length === 0) {
    return "";
  }

  if (text.length > SPEECH_MAX_CHARS) {
    return `${text.slice(0, SPEECH_MAX_CHARS).trimEnd()}${TRUNCATION_SUFFIX}`;
  }

  return text;
}

/**
 * Ajusta un código ISO al formato BCP-47 que espera la Web Speech API. Los códigos
 * del catálogo son ISO-639-1 (`en`, `es`, `ja`), pero una tarjeta puede traer
 * uno regional (`pt-br`).
 */
export function toSpeechLang(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }

  const normalized = code.trim().toLowerCase().replace("_", "-");

  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(normalized)) {
    return null;
  }

  return normalized;
}

/** Voz disponible del sistema para un idioma, o `null` si no hay ninguna. */
export function pickVoiceForLang(
  voices: readonly SpeechSynthesisVoice[],
  lang: string | null
): SpeechSynthesisVoice | null {
  if (voices.length === 0) {
    return null;
  }

  if (!lang) {
    return null;
  }

  const prefix = lang.split("-")[0];

  // Primero una voz exacta del idioma y, si no hay, cualquiera de su variantes
  // regionales ("es" encuentra "es-ES" y "es-MX").
  return (
    voices.find((voice) => voice.lang.toLowerCase() === lang) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${prefix}-`)) ??
    null
  );
}