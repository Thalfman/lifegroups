import Link from "next/link";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { P, fontSans } from "@/lib/pastoral";

export type PButtonTone = "ghost" | "solid" | "terra";
export type PButtonSize = "sm" | "md";

// Exported so a raw `<a download>` link (which can't be a Next <Link> or a
// <button>) can be styled exactly like a PButton — e.g. the Clean Slate Export
// download anchor (#294).
export function pButtonStyle(
  tone: PButtonTone = "ghost",
  size: PButtonSize = "md"
): CSSProperties {
  return styleFor(tone, size);
}

function styleFor(tone: PButtonTone, size: PButtonSize): CSSProperties {
  const padding = size === "sm" ? "8px 14px" : "10px 18px";
  const fontSize = size === "sm" ? 12 : 13;
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding,
    borderRadius: 999,
    fontSize,
    fontFamily: fontSans,
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "none",
    lineHeight: 1.2,
    transition: "background .12s, color .12s, border-color .12s, opacity .12s",
  };
  if (tone === "solid") {
    return { ...base, background: P.ink, color: P.surface, border: "none" };
  }
  if (tone === "terra") {
    return { ...base, background: P.terra, color: P.surface, border: "none" };
  }
  return {
    ...base,
    background: "transparent",
    color: P.ink,
    border: `1px solid ${P.line}`,
  };
}

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
    <Link
      href={href}
      aria-label={ariaLabel}
      style={{ ...styleFor(tone, size), ...style }}
    >
      {children}
    </Link>
  );
}

type PButtonProps = PButtonCommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style">;

export function PButton({
  tone = "ghost",
  size = "md",
  style,
  disabled,
  children,
  ...rest
}: PButtonProps) {
  const baseStyle = styleFor(tone, size);
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...baseStyle,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
