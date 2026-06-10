import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The status vocabulary — the only meanings color may carry:
 *  sage = well · clay = needs follow-up · amber = watch · rose = concern ·
 *  blue = info. Soft background + Deep foreground, always with a text label. */
export type BadgeTone =
  | "neutral"
  | "sage"
  | "clay"
  | "amber"
  | "rose"
  | "blue"
  | "ghost";

/** Meaning → tone, as one importable object. Surface-local status maps key
 *  their domain enums off these names (e.g. `overdue: STATUS_TONES.followUp`)
 *  so the meaning of each hue can't drift per surface. */
export const STATUS_TONES = {
  well: "sage",
  watch: "amber",
  followUp: "clay",
  concern: "rose",
  info: "blue",
} as const satisfies Record<string, BadgeTone>;

const TONES: Record<BadgeTone, string> = {
  neutral: "border border-line bg-surfaceAlt text-ink2",
  sage: "bg-sageSoft text-sageDeep",
  clay: "bg-claySoft text-clayDeep",
  amber: "bg-amberSoft text-amberText",
  rose: "bg-roseSoft text-rose",
  blue: "bg-blueSoft text-blue",
  ghost: "border border-line bg-transparent text-ink3",
};

const DOTS: Record<BadgeTone, string> = {
  neutral: "bg-ink3",
  sage: "bg-sage",
  clay: "bg-clay",
  amber: "bg-amber",
  rose: "bg-rose",
  blue: "bg-blue",
  ghost: "bg-ink3",
};

export function badgeDotClassName(tone: BadgeTone): string {
  return DOTS[tone];
}

export function Badge({
  tone = "neutral",
  dot = false,
  size = "sm",
  className,
  style,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  size?: "sm" | "lg";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill font-sans text-xs font-medium",
        size === "lg" ? "px-2.5 py-1" : "px-2 py-0.5",
        TONES[tone],
        className
      )}
      style={style}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 shrink-0 rounded-pill", DOTS[tone])}
        />
      ) : null}
      {children}
    </span>
  );
}
