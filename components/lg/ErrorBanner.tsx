import type { ReactNode } from "react";
import { P, fontBody } from "@/lib/pastoral";

// The canonical terra load-failure banner. Several admin surfaces rendered this
// exact markup inline; this is the shared home for it so the colour, radius, and
// padding stay consistent.
export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      style={{
        margin: 0,
        fontFamily: fontBody,
        fontSize: 13,
        color: "#7d3621",
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 8,
        padding: "10px 14px",
      }}
    >
      {children}
    </p>
  );
}
