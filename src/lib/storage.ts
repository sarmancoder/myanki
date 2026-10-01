import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { MEDIA_LIMITS, MEDIA_MIME_TYPES, type MediaKind } from "@/lib/media";

export type { MediaKind };
export { MEDIA_LIMITS };

/**
 * Almacenamiento local de los adjuntos de las tarjetas.
 *
 * Los archivos se escriben en `public/uploads/<userId>/<kind>/` y se sirven como
 * estáticos por Next.js, de modo que no hace falta ninguna API route para leerlos.
 *
 * La capa está aislada a propósito: para desplegar en Vercel (sistema de archivos
 * efímero) basta con reemplazar {@link saveMedia} y {@link deleteMedia} por un
 * cliente de Supabase Storage o S3 manteniendo la misma firma. El resto de la
 * aplicación solo conoce las URLs que devuelve {@link saveMedia}.
 */

export class MediaUploadError extends Error {}

export interface SaveMediaInput {
  userId: string;
  kind: MediaKind;
  /** Contenido del archivo en base64, sin la cabecera `data:...;base64,`. */
  base64: string;
  mimeType: string;
}

export interface SavedMedia {
  url: string;
  bytes: number;
}

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Los nombres de archivo se generan siempre en el servidor: el cliente nunca
 * decide la ruta, solo aporta el contenido y el MIME type.
 */
function buildRelativePath(userId: string, kind: MediaKind, extension: string): string {
  return path.posix.join(userId, kind, `${crypto.randomUUID()}${extension}`);
}

/**
 * Valida que la ruta resuelva siga dentro de `public/uploads`. Sin esta comprobación
 * un `userId` manipulado podría escribir fuera del directorio de adjuntos.
 */
function assertInsideUploads(absolutePath: string): void {
  const uploadsRoot = `${path.resolve(UPLOADS_DIR)}${path.sep}`;

  if (!path.resolve(absolutePath).startsWith(uploadsRoot)) {
    throw new MediaUploadError("Ruta de archivo no válida");
  }
}

/** Tamaño real del base64 sin decodificar: `bytes = 3/4 * caracteres - padding`. */
function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;

  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function acceptedFormatsLabel(kind: MediaKind): string {
  return [...new Set(Object.values(MEDIA_MIME_TYPES[kind]))]
    .map((extension) => extension.replace(".", "").toUpperCase())
    .join(", ");
}

export async function saveMedia(input: SaveMediaInput): Promise<SavedMedia> {
  const normalizedMime = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = MEDIA_MIME_TYPES[input.kind][normalizedMime];

  if (!extension) {
    // El SVG se excluye de la lista blanca a propósito: servido desde el mismo
    // origen, permitiría ejecutar scripts embebidos.
    throw new MediaUploadError(
      `Formato no admitido para ${input.kind === "image" ? "imágenes" : "audio"}. Se aceptan: ${acceptedFormatsLabel(input.kind)}.`
    );
  }

  if (input.base64.length === 0) {
    throw new MediaUploadError("El archivo está vacío");
  }

  const limit = MEDIA_LIMITS[input.kind];

  if (estimateBase64Bytes(input.base64) > limit.maxBytes) {
    throw new MediaUploadError(`El archivo supera el tamaño máximo permitido (${limit.label})`);
  }

  const buffer = Buffer.from(input.base64, "base64");

  if (buffer.length === 0) {
    throw new MediaUploadError("El archivo está vacío");
  }

  if (buffer.length > limit.maxBytes) {
    throw new MediaUploadError(`El archivo supera el tamaño máximo permitido (${limit.label})`);
  }

  const relativePath = buildRelativePath(input.userId, input.kind, extension);
  const absolutePath = path.join(UPLOADS_DIR, relativePath);

  assertInsideUploads(absolutePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return { url: `/uploads/${relativePath.split(path.sep).join("/")}`, bytes: buffer.length };
}

/** El usuario solo puede borrar archivos que él mismo ha subido. */
export function isOwnManagedMediaUrl(url: string | null | undefined, userId: string): boolean {
  if (!url) {
    return false;
  }

  return url.startsWith(`/uploads/${userId}/`);
}

/**
 * Borra un adjunto propio. Los fallos se ignoran a propósito: un archivo huérfano
 * no debe impedir guardar la tarjeta.
 */
export async function deleteMedia(url: string, userId: string): Promise<void> {
  if (!isOwnManagedMediaUrl(url, userId)) {
    return;
  }

  const absolutePath = path.join(UPLOADS_DIR, url.replace(/^\/uploads\//, ""));

  try {
    assertInsideUploads(absolutePath);
    await fs.unlink(absolutePath);
  } catch {
    // El archivo ya no existe o no se puede borrar: se ignora.
  }
}