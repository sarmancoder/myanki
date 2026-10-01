export const CARD_TYPES = ["basic", "cloze", "optional"] as const;

export type CardType = (typeof CARD_TYPES)[number];

export interface CardTypeOption {
  value: CardType;
  label: string;
  hint: string;
}

export const CARD_TYPE_OPTIONS: CardTypeOption[] = [
  {
    value: "basic",
    label: "Básica",
    hint: "Anverso → Reverso. La opción por defecto.",
  },
  {
    value: "optional",
    label: "Opcional",
    hint: "Básica con un campo de pronunciación opcional.",
  },
  {
    value: "cloze",
    label: "Cloze",
    hint: 'Anverso con huecos {{c1::texto}} que se rellenan al estudiar.',
  },
];

/** Estados de aprendizaje que hereda el módulo de scheduling (`card_scheduling`). */
export const CARD_STATUSES = ["new", "learning", "review", "relearning"] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

/**
 * Filtros del listado. `all` y `suspended` no son estados reales del SRS:
 * `suspended` se apoya en el booleano `cards.is_suspended`.
 */
export const CARD_STATUS_FILTERS = ["all", ...CARD_STATUSES, "suspended"] as const;

export type CardStatusFilter = (typeof CARD_STATUS_FILTERS)[number];

export const CARD_STATUS_FILTER_LABELS: Record<CardStatusFilter, string> = {
  all: "Todas",
  new: "Nuevas",
  learning: "En aprendizaje",
  relearning: "Reaprendiendo",
  review: "Aprendidas",
  suspended: "Suspendidas",
};

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  new: "Nueva",
  learning: "Aprendiendo",
  review: "Aprendida",
  relearning: "Reaprendiendo",
};

export const CARD_COLOR_TAGS = ["red", "blue", "green", "yellow", "purple"] as const;

export type CardColorTag = (typeof CARD_COLOR_TAGS)[number];

export interface CardColorOption {
  value: CardColorTag;
  label: string;
  /** Clases de Tailwind para la pastilla de color. */
  badgeClassName: string;
  /** Clases de Tailwind para el punto de color compacto. */
  dotClassName: string;
}

export const CARD_COLOR_OPTIONS: CardColorOption[] = [
  {
    value: "red",
    label: "Rojo",
    badgeClassName: "bg-red-100 text-red-700 border border-red-200",
    dotClassName: "bg-red-500",
  },
  {
    value: "blue",
    label: "Azul",
    badgeClassName: "bg-blue-100 text-blue-700 border border-blue-200",
    dotClassName: "bg-blue-500",
  },
  {
    value: "green",
    label: "Verde",
    badgeClassName: "bg-green-100 text-green-700 border border-green-200",
    dotClassName: "bg-green-500",
  },
  {
    value: "yellow",
    label: "Amarillo",
    badgeClassName: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    dotClassName: "bg-yellow-500",
  },
  {
    value: "purple",
    label: "Morado",
    badgeClassName: "bg-purple-100 text-purple-700 border border-purple-200",
    dotClassName: "bg-purple-500",
  },
];

export const CARD_COLOR_LABELS: Record<CardColorTag, string> = {
  red: "Rojo",
  blue: "Azul",
  green: "Verde",
  yellow: "Amarillo",
  purple: "Morado",
};

export function isCardType(value: string): value is CardType {
  return (CARD_TYPES as readonly string[]).includes(value);
}

export function isCardStatusFilter(value: string): value is CardStatusFilter {
  return (CARD_STATUS_FILTERS as readonly string[]).includes(value);
}

export function isCardColorTag(value: string): value is CardColorTag {
  return (CARD_COLOR_TAGS as readonly string[]).includes(value);
}

export function getCardTypeLabel(value: string): string {
  return CARD_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function getCardColorOption(value: string | null | undefined): CardColorOption | null {
  if (!value) {
    return null;
  }

  return CARD_COLOR_OPTIONS.find((option) => option.value === value) ?? null;
}

/** Campos personalizados sugeridos al crear una tarjeta. */
export const SUGGESTED_EXTRA_FIELDS = [
  { key: "pronunciation", label: "Pronunciación" },
  { key: "example", label: "Ejemplo" },
  { key: "note", label: "Nota" },
] as const;