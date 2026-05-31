import Link from "next/link";
import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { OverShepherdListRow } from "@/lib/supabase/read-models";
import {
  buildShepherdCareViewHref,
  type CoverageFilter,
  type DirectoryFilter,
} from "@/lib/admin/shepherd-care-view";

// The view-state types live in the pure shepherd-care-view module (#178); they
// are re-exported here so existing component imports keep resolving. Coverage
// filter is a separate URL dimension that composes with the needs-attention
// filter: undefined (any), a uuid (specific over-shepherd), or "unassigned".
export type {
  DirectoryFilter,
  CoverageFilter,
} from "@/lib/admin/shepherd-care-view";

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

// The filter chips live in the Directory view, so their links stay in the
// Directory view (view=directory) while toggling the needs-attention filter.
function buildHref(params: {
  filter: DirectoryFilter;
  coverage: CoverageFilter | undefined;
}): string {
  return buildShepherdCareViewHref({
    view: "directory",
    filter: params.filter,
    coverage: params.coverage,
  });
}

export function ShepherdCareFilterChips({
  current,
  totalCount,
  needsAttentionCount,
  coverage,
}: {
  current: DirectoryFilter;
  totalCount: number;
  needsAttentionCount: number;
  coverage: CoverageFilter | undefined;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <Link
        href={buildHref({ filter: "all", coverage })}
        style={current === "all" ? ACTIVE : CHIP}
      >
        All <span style={COUNT}>{totalCount}</span>
      </Link>
      <Link
        href={buildHref({ filter: "needs_attention", coverage })}
        style={current === "needs_attention" ? ACTIVE : CHIP}
      >
        Needs attention <span style={COUNT}>{needsAttentionCount}</span>
      </Link>
    </div>
  );
}

const SELECT_STYLE: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${P.line}`,
  background: P.surface,
  fontFamily: fontSans,
  fontSize: 12,
  color: P.ink,
  cursor: "pointer",
};

export function ShepherdCareCoverageFilter({
  filter,
  coverage,
  overShepherds,
  unassignedCount,
}: {
  filter: DirectoryFilter;
  coverage: CoverageFilter | undefined;
  overShepherds: OverShepherdListRow[];
  unassignedCount: number;
}) {
  const activeOverShepherds = overShepherds.filter((os) => os.active);
  // Inline form keeps SSR-friendly behavior (no client JS). Submitting
  // sends both `filter` and `coverage` as GET params so the chosen
  // needs-attention chip is preserved on coverage change.
  return (
    <form
      method="get"
      action="/admin/shepherd-care"
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {/* Stay in the Directory view when applying a coverage filter. */}
      <input type="hidden" name="view" value="directory" />
      {filter === "needs_attention" ? (
        <input type="hidden" name="filter" value="needs_attention" />
      ) : null}
      <label
        htmlFor="sc-coverage-filter"
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
        }}
      >
        Coverage
      </label>
      <select
        id="sc-coverage-filter"
        name="coverage"
        defaultValue={coverage ?? ""}
        style={SELECT_STYLE}
      >
        <option value="">Any</option>
        <option value="unassigned">Unassigned ({unassignedCount})</option>
        {activeOverShepherds.map((os) => (
          <option key={os.id} value={os.id}>
            {os.full_name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        style={{
          ...SELECT_STYLE,
          background: P.bgDeep,
          cursor: "pointer",
        }}
      >
        Apply
      </button>
    </form>
  );
}
