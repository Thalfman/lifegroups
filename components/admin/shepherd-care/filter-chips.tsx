import Link from "next/link";
import type { CSSProperties } from "react";
import { P, fontSans } from "@/lib/pastoral";

export type DirectoryFilter = "all" | "needs_attention";

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 14px",
  borderRadius: 999,
  fontSize: 12,
  fontFamily: fontSans,
  fontWeight: 500,
  textDecoration: "none",
  border: `1px solid ${P.line}`,
  color: P.ink2,
  background: "transparent",
};

const ACTIVE: CSSProperties = {
  ...CHIP,
  background: P.ink,
  color: P.surface,
  borderColor: P.ink,
};

const COUNT: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 18,
  padding: "0 5px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  background: "rgba(255,255,255,0.18)",
};

export function ShepherdCareFilterChips({
  current,
  totalCount,
  needsAttentionCount,
}: {
  current: DirectoryFilter;
  totalCount: number;
  needsAttentionCount: number;
}) {
  return (
    <div
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
    >
      <Link
        href="/admin/shepherd-care"
        style={current === "all" ? ACTIVE : CHIP}
      >
        All <span style={COUNT}>{totalCount}</span>
      </Link>
      <Link
        href="/admin/shepherd-care?filter=needs_attention"
        style={current === "needs_attention" ? ACTIVE : CHIP}
      >
        Needs attention <span style={COUNT}>{needsAttentionCount}</span>
      </Link>
    </div>
  );
}
