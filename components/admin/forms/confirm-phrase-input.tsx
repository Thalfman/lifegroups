import type { ReactNode } from "react";
import { fieldInputClassName } from "./field-styles";
import { FormField } from "./form-field";

/**
 * The single matching rule for danger-zone type-to-confirm gates. Kept beside
 * the input so the disable logic can't drift from what the field accepts.
 */
export function confirmPhraseMatches(value: string, phrase: string): boolean {
  return value.trim() === phrase;
}

/**
 * The danger-zone type-to-confirm field. Renders labeled (a FormField wrapper,
 * pass `id` + `label`) or bare (no wrapper; pass `ariaLabel` so the input
 * keeps an accessible name — e.g. inline beside a Restore button).
 */
export function ConfirmPhraseInput({
  phrase,
  value,
  onChange,
  id,
  name = "confirm",
  label,
  ariaLabel,
  bounded = false,
  className,
}: {
  phrase: string;
  value: string;
  onChange: (value: string) => void;
  /** Required when `label` is set. */
  id?: string;
  name?: string;
  /** e.g. <>Type {PHRASE} to confirm</>. Omit for the bare aria-label mode. */
  label?: ReactNode;
  /** Accessible name for the bare mode (no <label> element rendered). */
  ariaLabel?: string;
  /** Bounds the input for inline placement beside its button. */
  bounded?: boolean;
  /** Wrapper classes in labeled mode (e.g. flex sizing in a field row). */
  className?: string;
}) {
  const input = (
    <input
      id={id}
      name={name}
      type="text"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={phrase}
      aria-label={label == null ? ariaLabel : undefined}
      className={
        bounded ? `${fieldInputClassName} max-w-[220px]` : fieldInputClassName
      }
    />
  );

  if (label == null) return input;
  return (
    <FormField htmlFor={id ?? ""} label={label} className={className}>
      {input}
    </FormField>
  );
}
