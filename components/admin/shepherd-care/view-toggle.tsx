import Link from "next/link";
import type { CSSProperties } from "react";
import { P, fontSans } from "@/lib/pastoral";
import {
  buildShepherdCareViewHref,
  type CoverageFilter,
  type DirectoryFilter,
  type ShepherdCareView,
} from "@/lib/admin/shepherd-care-view";

// Segmented Dashboard | Directory control under the Leader-care page header
// (#178). One nav item, one route; this just flips the `?view=` param while
// carrying the current filter / coverage selection across, so the chosen view
// is bookmarkable.

const SEGMENT_WRAP: CSSProperties = {
  display: "inline-flex",
  gap: 2,
  padding: 3,
  borderRadius: 999,
  border: `1px solid ${P.line}`,
  background: P.bg,
};

const SEGMENT: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 16px",
  borderRadius: 999,
  fontSize: 13,
  fontFamily: fontSans,
  fontWeight: 500,
  textDecoration: "none",
  color: P.ink2,
  background: "transparent",
};

const SEGMENT_ACTIVE: CSSProperties = {
  ...SEGMENT,
  background: P.surface,
  color: P.ink,
  boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
};

export function ShepherdCareViewToggle({
  current,
  filter,
  coverage,
}: {
  current: ShepherdCareView;
  filter: DirectoryFilter;
  coverage: CoverageFilter | undefined;
}) {
  const segments: { view: ShepherdCareView; label: string }[] = [
    { view: "dashboard", label: "Dashboard" },
    { view: "directory", label: "Directory" },
  ];
  return (
    <nav aria-label="Leader care view" style={SEGMENT_WRAP}>
      {segments.map((s) => (
        <Link
          key={s.view}
          href={buildShepherdCareViewHref({ view: s.view, filter, coverage })}
          aria-current={current === s.view ? "page" : undefined}
          style={current === s.view ? SEGMENT_ACTIVE : SEGMENT}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
