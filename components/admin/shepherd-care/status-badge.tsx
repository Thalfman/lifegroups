import type { CSSProperties } from "react";
import { P } from "@/lib/pastoral";
import type { ShepherdCareStatus } from "@/types/enums";
import { shepherdCareStatusLabel } from "@/lib/dashboard/labels";

const BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const TONES: Record<ShepherdCareStatus, CSSProperties> = {
  healthy: {
    background: P.sageSoft,
    color: "#3e4f29",
    border: `1px solid ${P.line}`,
  },
  watch: {
    background: "#fff5d9",
    color: "#6a4d11",
    border: "1px solid #efdfa3",
  },
  needs_attention: {
    background: P.terraSoft,
    color: "#923220",
    border: "1px solid #e4b9a8",
  },
};

export function ShepherdCareStatusBadge({ status }: { status: ShepherdCareStatus }) {
  return (
    <span style={{ ...BASE, ...TONES[status] }}>
      {shepherdCareStatusLabel(status)}
    </span>
  );
}
