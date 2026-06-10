import type { CSSProperties, ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";

// Compatibility wrapper over the design-system Badge (components/ui/badge.tsx)
// — Pill's tone names are the Badge tone names.
export type PillTone = BadgeTone;

export function Pill({
  children,
  tone = "neutral",
  size = "sm",
  style,
}: {
  children: ReactNode;
  tone?: PillTone;
  size?: "sm" | "lg";
  style?: CSSProperties;
}) {
  return (
    <Badge tone={tone} size={size} style={style}>
      {children}
    </Badge>
  );
}
