"use client";

import Markdown from "@/components/ui/Markdown";
import { hideClozeDeletions, splitCloze } from "@/lib/cards/cloze";

interface CardPreviewProps {
  /** Texto del anverso. Si es `cloze` se muestran los huecos ocultos. */
  front: string;
  /** `false` para tarjetas que no son de tipo cloze. */
  isCloze: boolean;
  clamp?: number;
  /** Añade un prefijo como "Reverso:" al contenido renderizado. */
  label?: string;
  className?: string;
}

/**
 * Vista previa del anverso. En las tarjetas cloze sustituye cada borrado por su
 * pista (o por `[...]`) para que el listado se parezca a lo que verá el usuario
 * al estudiar, sin revelar la respuesta.
 */
export default function CardPreview({
  front,
  isCloze,
  clamp,
  label,
  className = "",
}: CardPreviewProps) {
  if (!isCloze) {
    return (
      <div className={`min-w-0 ${className}`.trim()}>
        {label && <span className="sr-only">{label}</span>}
        <Markdown clamp={clamp}>{front}</Markdown>
      </div>
    );
  }

  const parts = splitCloze(front);
  const hasDeletion = parts.some((part) => part.kind === "deletion");

  // Sin borrados válidos se cae al Markdown normal en lugar de mostrar texto vacío.
  if (!hasDeletion) {
    return (
      <div className={`min-w-0 ${className}`.trim()}>
        <Markdown clamp={clamp}>{front}</Markdown>
      </div>
    );
  }

  const rendered = parts.map((part, index) => {
    if (part.kind === "text") {
      return <span key={index}>{part.value}</span>;
    }

    return (
      <span
        key={index}
        className="mx-0.5 inline-block rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800"
        title={part.hint ? `Pista: ${part.hint}` : "Borrado cloze"}
      >
        {part.hint ?? `[${part.index}]`}
      </span>
    );
  });

  return (
    <div
      className={`min-w-0 break-words text-sm text-primary ${className}`.trim()}
      style={clamp ? { display: "-webkit-box", WebkitLineClamp: clamp, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}
    >
      {rendered}
    </div>
  );
}

/** Texto plano del anverso para tooltips y búsquedas: sin Markdown ni marcadores. */
export function getFrontPlainText(front: string, isCloze: boolean): string {
  return isCloze ? hideClozeDeletions(front) : front;
}