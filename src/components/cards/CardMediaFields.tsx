"use client";

import { useRef, useState } from "react";
import { uploadCardMediaAction } from "@/server/actions";
import { getErrorMessage, isError, isSuccess } from "@/lib/orpc";
import { MEDIA_ACCEPT, MEDIA_LIMITS, type MediaKind } from "@/lib/media";

interface CardMediaFieldsProps {
  imageUrl: string | null;
  audioUrl: string | null;
  onChange: (next: { imageUrl: string | null; audioUrl: string | null }) => void;
}

/**
 * Lee el archivo y lo devuelve en base64. Los Server Actions serializan el input
 * como JSON, así que un `File` no sobrevive al viaje: el base64 sí.
 */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  // `String.fromCharCode(...bytes)` desborda la pila con archivos grandes, de ahí el troceo.
  const CHUNK_SIZE = 8192;

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }

  return btoa(binary);
}

interface MediaUploaderProps {
  kind: MediaKind;
  url: string | null;
  onChange: (url: string | null) => void;
}

function MediaUploader({ kind, url, onChange }: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limit = MEDIA_LIMITS[kind];
  const isImage = kind === "image";
  const label = isImage ? "Imagen" : "Audio";

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    // Permite reintentar con el mismo archivo después de un error.
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);

    if (file.size > limit.maxBytes) {
      setError(`El archivo supera el tamaño máximo permitido (${limit.label})`);
      return;
    }

    setIsUploading(true);

    try {
      const base64 = await fileToBase64(file);
      const result = await uploadCardMediaAction({ kind, base64, mimeType: file.type });

      if (isError(result)) {
        setError(getErrorMessage(result[1].message, `No se pudo subir el ${label.toLowerCase()}`));
        return;
      }

      if (isSuccess(result)) {
        onChange(result[0].url);
      }
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {isUploading ? "Subiendo..." : url ? `Reemplazar ${label.toLowerCase()}` : `Adjuntar ${label.toLowerCase()}`}
        </button>

        {url && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={isUploading}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Quitar
          </button>
        )}

        <span className="text-xs text-secondary-foreground">Máx. {limit.label}</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT[kind]}
        onChange={handleFile}
        className="sr-only"
        aria-label={`Adjuntar ${label.toLowerCase()}`}
      />

      {error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      {url && isImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Vista previa de la imagen adjunta"
          className="max-h-32 rounded-lg border border-border object-contain"
        />
      )}

      {url && !isImage && <audio src={url} controls className="h-9 w-full max-w-sm" />}
    </div>
  );
}

/** Adjuntos de imagen y audio de la tarjeta (columnas `image_url` y `audio_url`). */
export default function CardMediaFields({ imageUrl, audioUrl, onChange }: CardMediaFieldsProps) {
  return (
    <div className="space-y-4">
      <MediaUploader
        kind="image"
        url={imageUrl}
        onChange={(next) => onChange({ imageUrl: next, audioUrl })}
      />
      <MediaUploader
        kind="audio"
        url={audioUrl}
        onChange={(next) => onChange({ imageUrl, audioUrl: next })}
      />
    </div>
  );
}