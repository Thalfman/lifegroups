import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Elevation rule: border OR shadow, not both. Cards on cream get a 1px line
// border and no shadow; shadow is reserved for things that float (drawer,
// menus, sticky mobile bars).
//
// The className exports exist for surfaces that need card anatomy on a
// non-div element (e.g. <section>) — same single source as the component.
const cardBaseClassName = "rounded-lg border border-line bg-surface";
export const cardClassName = `${cardBaseClassName} p-card`;
export const cardHeadingClassName =
  "m-0 mb-3 font-display text-lg font-medium text-ink";

export function Card({
  children,
  style,
  className,
  padded = true,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(cardBaseClassName, padded && "p-card", className)}
      style={style}
    >
      {children}
    </div>
  );
}
