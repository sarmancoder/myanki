"use client";

import { CARD_COLOR_OPTIONS, type CardColorTag } from "@/constants/cards";

interface CardColorTagSelectProps {
  value: CardColorTag | null;
  onChange: (value: CardColorTag | null) => void;
  /** Etiqueta accesible del grupo de opciones. */
  label: string;
  disabled?: boolean;
}

interface ColorOptionProps {
  color: (typeof CARD_COLOR_OPTIONS)[number];
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
}

function ColorOption({ color, selected, onSelect, disabled }: ColorOptionProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      title={color.label}
      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform disabled:opacity-50 ${
        selected ? "scale-110 border-primary" : "border-transparent hover:scale-105"
      }`}
    >
      <span className={`h-5 w-5 rounded-full ${color.dotClassName}`} aria-hidden="true" />
      <span className="sr-only">{color.label}</span>
    </button>
  );
}

export default function CardColorTagSelect({
  value,
  onChange,
  label,
  disabled = false,
}: CardColorTagSelectProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      {CARD_COLOR_OPTIONS.map((color) => (
        <ColorOption
          key={color.value}
          color={color}
          selected={value === color.value}
          disabled={disabled}
          onSelect={() => onChange(value === color.value ? null : color.value)}
        />
      ))}

      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={disabled || value === null}
        title="Sin color"
        className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary disabled:opacity-50"
      >
        Sin color
      </button>
    </div>
  );
}