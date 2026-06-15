import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";
import { fieldInputClassName } from "@/components/admin/forms/field-styles";
import { cn } from "@/lib/utils";

// Thin primitives over the shared field-input look (field-styles.ts): a
// full-width, line-bordered, rounded-sm control with the global focus ring and
// the 16px mobile font guard. Callers add per-field width / spacing through
// `className`, which `cn` merges over the shared base.

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

export function Input({ className, ref, ...rest }: InputProps) {
  return (
    <input ref={ref} {...rest} className={cn(fieldInputClassName, className)} />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
};

export function Textarea({ className, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      {...rest}
      className={cn(fieldInputClassName, className)}
    />
  );
}
