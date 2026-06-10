import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Button, LinkButton, type ButtonVariant } from "@/components/ui/button";

// Thin compatibility wrappers over the design-system Button
// (components/ui/button.tsx) so existing call sites upgrade without edits.
export type PButtonTone = "ghost" | "solid" | "terra";
export type PButtonSize = "sm" | "md";

const TONE_TO_VARIANT: Record<PButtonTone, ButtonVariant> = {
  ghost: "ghost",
  solid: "solid",
  terra: "primary",
};

type PButtonCommonProps = {
  tone?: PButtonTone;
  size?: PButtonSize;
  style?: CSSProperties;
  children: ReactNode;
};

type PLinkButtonProps = PButtonCommonProps & {
  href: string;
  // Explicit accessible name, so a link whose visible text is generic
  // ("Open group calendar") can still carry record context (#322).
  "aria-label"?: string;
};

export function PLinkButton({
  tone = "ghost",
  size = "md",
  href,
  style,
  children,
  "aria-label": ariaLabel,
}: PLinkButtonProps) {
  return (
    <LinkButton
      href={href}
      aria-label={ariaLabel}
      variant={TONE_TO_VARIANT[tone]}
      size={size}
      style={style}
    >
      {children}
    </LinkButton>
  );
}

type PButtonProps = PButtonCommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style">;

export function PButton({
  tone = "ghost",
  size = "md",
  style,
  children,
  ...rest
}: PButtonProps) {
  return (
    <Button {...rest} variant={TONE_TO_VARIANT[tone]} size={size} style={style}>
      {children}
    </Button>
  );
}
