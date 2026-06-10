import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Elevation rule: border OR shadow, not both. Cards on cream get a 1px line
// border and no shadow; shadow is reserved for things that float (drawer,
// menus, sticky mobile bars).
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
      className={cn(
        "rounded-lg border border-line bg-surface",
        padded && "p-card",
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}
