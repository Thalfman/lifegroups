import type { Ref, SelectHTMLAttributes } from "react";
import { fieldSelectClassName } from "@/components/admin/forms/field-styles";
import { cn } from "@/lib/utils";

// Thin primitive over the shared field-select look (field-styles.ts). Selects
// share the input look; the native appearance stays so the platform draws its
// own caret. Callers pass `<option>` children and any per-field `className`,
// which `cn` merges over the shared base.

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  ref?: Ref<HTMLSelectElement>;
};

export function Select({ className, children, ref, ...rest }: SelectProps) {
  return (
    <select ref={ref} {...rest} className={cn(fieldSelectClassName, className)}>
      {children}
    </select>
  );
}
