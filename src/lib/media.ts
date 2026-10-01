/**
 * Constantes y utilidades de los adjuntos compartidas entre cliente y servidor.
 *
 * `src/lib/storage.ts` está marcado como `server-only` (usa `node:fs`), así que
 * los límites y las listas de formatos viven aquí para poder importarlos también
 * desde los componentes de cliente sin arrastrar el módulo del servidor.
 */

export type MediaKind = "image" | "audio";

export const MEDIA_LIMITS: Record<MediaKind, { maxBytes: number; label: string }> = {
  image: { maxBytes: 4 * 1024 * 1024, label: "4 MB" },
  audio: { maxBytes: 6 * 1024 * 1024, label: "6 MB" },
};

export const MEDIA_ACCEPT: Record<MediaKind, string> = {
  image: "image/png,image/jpeg,image/webp,image/gif,image/avif",
  audio: "audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/wav,audio/x-wav,audio/webm",
};

export const MEDIA_MIME_TYPES: Record<MediaKind, Record<string, string>> = {
  image: {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
  },
  audio: {
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
    "audio/ogg": ".ogg",
    "audio/opus": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".weba",
  },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}