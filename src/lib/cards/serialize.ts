import { CARD_STATUS_FILTERS, type CardStatus, type CardStatusFilter } from "@/constants/cards";
import type { CardExtraFields, CardListItem, CardSchedulingView } from "@/types/card";

type DecimalLike = { toNumber(): number } | number | string | null | undefined;

/** Prisma devuelve `Decimal` (o `BigInt` si alguien cambia la columna) en los campos numéricos. */
export function toNumber(value: DecimalLike): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "object") {
    return value.toNumber();
  }

  const parsed = typeof value === "string" ? Number.parseFloat(value) : value;

  return Number.isFinite(parsed) ? parsed : 0;
}

export function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

interface RawScheduling {
  status: string;
  easeFactor?: DecimalLike;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueDate: Date;
  lastReviewedAt: Date | null;
}

interface RawCard {
  id: string;
  deck: { id: string; name: string; slug: string };
  cardType: string;
  front: string;
  back: string;
  extraFields: unknown;
  imageUrl: string | null;
  audioUrl: string | null;
  isSuspended: boolean;
  colorTag: string | null;
  createdAt: Date;
  updatedAt: Date;
  scheduling: RawScheduling | null;
}

function toSchedulingView(raw: RawScheduling | null): CardSchedulingView {
  if (!raw) {
    return {
      status: "new",
      intervalDays: 0,
      dueDate: new Date(0).toISOString(),
      easeFactor: 2.5,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: null,
    };
  }

  return {
    status: raw.status as CardStatus,
    intervalDays: raw.intervalDays,
    dueDate: new Date(raw.dueDate).toISOString(),
    easeFactor: toNumber(raw.easeFactor),
    repetitions: raw.repetitions,
    lapses: raw.lapses,
    lastReviewedAt: toIsoString(raw.lastReviewedAt),
  };
}

/**
 * Convierte una fila de Prisma en la vista que viaja al cliente. Todo lo que no
 * sea `string` se normaliza aquí para no filtrar `Decimal` ni `Date` sueltos por
 * la serialización de Server Actions.
 */
export function toCardListItem(
  raw: RawCard,
  extraFields: (value: unknown) => CardExtraFields
): CardListItem {
  return {
    id: raw.id,
    deck: raw.deck,
    cardType: raw.cardType as CardListItem["cardType"],
    front: raw.front,
    back: raw.back,
    extraFields: extraFields(raw.extraFields),
    imageUrl: raw.imageUrl,
    audioUrl: raw.audioUrl,
    isSuspended: raw.isSuspended,
    colorTag: raw.colorTag as CardListItem["colorTag"],
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    scheduling: toSchedulingView(raw.scheduling),
  };
}

export function emptyStatusCounts(): Record<CardStatusFilter, number> {
  const counts = {} as Record<CardStatusFilter, number>;

  for (const status of CARD_STATUS_FILTERS) {
    counts[status] = 0;
  }

  return counts;
}