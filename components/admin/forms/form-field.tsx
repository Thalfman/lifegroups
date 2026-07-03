import type { ReactNode } from "react";
import { fieldHintClassName, fieldLabelClassName } from "./field-styles";

/**
 * The label + control (+ optional hint) triple every admin form field wires by
 * hand. The control is passed as `children` and must carry `id={htmlFor}`.
 * Deliberately no per-field error slot: validation errors surface at the form
 * level via <FormStatus>, not per field.
 */
export function FormField({
  htmlFor,
  label,
  hint,
  className,
  children,
}: {
  htmlFor: string;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={fieldLabelClassName}>
        {label}
      </label>
      {children}
      {hint != null ? <p className={fieldHintClassName}>{hint}</p> : null}
    </div>
  );
}
