import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type ButtonTone = "sage" | "clay" | "ghost" | "quiet";
export type ButtonSize = "sm" | "md" | "lg";

const TONES: Record<ButtonTone, { bg: string; fg: string; bd: string }> = {
  sage: { bg: "var(--c-sage)", fg: "#fdfcf9", bd: "var(--c-sage)" },
  clay: { bg: "var(--c-clay)", fg: "#fdfcf9", bd: "var(--c-clay)" },
  ghost: { bg: "var(--c-surface)", fg: "var(--c-ink)", bd: "var(--c-line)" },
  quiet: { bg: "transparent", fg: "var(--c-ink2)", bd: "var(--c-line)" },
};

type ButtonProps = {
  children?: ReactNode;
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: IconName;
  style?: CSSProperties;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size" | "style">;

export function Button({
  children,
  tone = "sage",
  size = "md",
  icon,
  style,
  type,
  ...rest
}: ButtonProps) {
  const t = TONES[tone];
  const pad = size === "lg" ? "11px 18px" : size === "sm" ? "5px 10px" : "8px 14px";
  const fs = size === "lg" ? 14 : size === "sm" ? 12 : 13;
  return (
    <button
      {...rest}
      type={type ?? "button"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: pad,
        borderRadius: 8,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.bd}`,
        fontFamily: "var(--font-body)",
        fontSize: fs,
        fontWeight: 500,
        cursor: "pointer",
        letterSpacing: 0.1,
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={fs + 2} /> : null}
      {children}
    </button>
  );
}
