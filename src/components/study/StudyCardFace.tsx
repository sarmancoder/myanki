"use client";

import Markdown from "@/components/ui/Markdown";
import { hideClozeDeletions } from "@/lib/cards/cloze";
import { getCardColorOption } from "@/constants/cards";
import type { StudyCardView } from "@/types/study";

interface CardImageProps {
  url: string;
}

function CardImage({ url }: CardImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Imagen de la tarjeta"
      className="mt-4 max-h-56 rounded-lg border border-border object-contain"
    />
  );
}

interface ExtraFieldsProps {
  card: StudyCardView;
}

function ExtraFields({ card }: ExtraFieldsProps) {
  const entries = Object.entries(card.extraFields);

  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="mt-4 space-y-2 border-t border-border pt-3">
      {entries.map(([name, value]) => (
        <div key={name} className="grid gap-1 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-secondary-foreground">{name}</dt>
          <dd className="min-w-0">
            <Markdown className="text-sm">{value}</Markdown>
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface FaceProps {
  children: React.ReactNode;
  label: string;
}

/** Anverso o reverso de la tarjeta, con la misma jerarquía visual en las dos caras. */
function Face({ children, label }: FaceProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-secondary-foreground">{label}</p>
      {children}
    </div>
  );
}

interface StudyCardFaceProps {
  card: StudyCardView;
  revealed: boolean;
}

/**
 * Contenido de la tarjeta que se estudia.
 *
 * En las tarjetas cloze el anverso oculta los borrados (`[...]`) y el reverso los
 * enseña, que es el formato con el que el usuario las creó. El reproductor de
 * audio no se incluye aquí a propósito: se pinta fuera del botón que revela la
 * respuesta para que space o clic no disparen también el audio.
 */
export default function StudyCardFace({ card, revealed }: StudyCardFaceProps) {
  const isCloze = card.cardType === "cloze";
  const color = getCardColorOption(card.colorTag);

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-secondary-foreground">
        <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">{card.deckName}</span>
        {color && (
          <span className={`rounded-full px-2 py-0.5 font-medium ${color.badgeClassName}`}>{color.label}</span>
        )}
        {isCloze && (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">Cloze</span>
        )}
      </div>

      <Face label="Anverso">
        <div className="text-lg leading-relaxed text-primary sm:text-xl">
          <Markdown>{isCloze ? hideClozeDeletions(card.front) : card.front}</Markdown>
        </div>
        {card.imageUrl && <CardImage url={card.imageUrl} />}
      </Face>

      {revealed && (
        <div className="mt-5 space-y-4 border-t border-border pt-5">
          {isCloze && (
            <Face label="Respuesta">
              <div className="text-lg leading-relaxed text-primary sm:text-xl">
                <Markdown>{card.front}</Markdown>
              </div>
            </Face>
          )}

          {card.back.trim().length > 0 && (
            <Face label="Reverso">
              <div className="text-lg leading-relaxed text-primary sm:text-xl">
                <Markdown>{card.back}</Markdown>
              </div>
            </Face>
          )}

          <ExtraFields card={card} />
        </div>
      )}
    </div>
  );
}