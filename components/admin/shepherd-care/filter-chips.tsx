import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { OverShepherdListRow } from "@/lib/supabase/shepherd-care-reads";
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

function chipClassName(active: boolean): string {
  return cn(
    "inline-flex items-center gap-1.5 rounded-pill border px-3.5 py-1.5 font-sans text-xs font-medium no-underline transition-colors duration-150",
    active
      ? "border-ink bg-ink text-surface"
      : "border-line bg-transparent text-ink2 hover:bg-surfaceAlt"
  );
}

const COUNT =
  "inline-flex min-w-[18px] items-center justify-center rounded-pill bg-white/20 px-1 text-2xs font-semibold";

// The chips live on the All-leaders roster (#477). Their links carry the
// legacy `view=directory` param — accepted forever, resolving back onto the
// All-leaders tab — while toggling the needs-attention filter, so a click
// re-navigates to the same tab with the roster filter applied (SSR-friendly,
// no client state).
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
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href={buildHref({ filter: "all", coverage })}
        className={chipClassName(current === "all")}
      >
        All <span className={COUNT}>{totalCount}</span>
      </Link>
      <Link
        href={buildHref({ filter: "needs_attention", coverage })}
        className={chipClassName(current === "needs_attention")}
      >
        Needs attention <span className={COUNT}>{needsAttentionCount}</span>
      </Link>
    </div>
  );
}

const SELECT =
  "cursor-pointer rounded-pill border border-line bg-surface px-2.5 py-1.5 font-sans text-xs text-ink";

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
      className="flex flex-wrap items-center gap-1.5"
    >
      {/* Stay in the Directory view when applying a coverage filter. */}
      <input type="hidden" name="view" value="directory" />
      {filter === "needs_attention" ? (
        <input type="hidden" name="filter" value="needs_attention" />
      ) : null}
      <label
        htmlFor="sc-coverage-filter"
        className="font-sans text-xs text-ink3"
      >
        Coverage
      </label>
      <select
        id="sc-coverage-filter"
        name="coverage"
        defaultValue={coverage ?? ""}
        className={SELECT}
      >
        <option value="">Any</option>
        <option value="unassigned">Unassigned ({unassignedCount})</option>
        {activeOverShepherds.map((os) => (
          <option key={os.id} value={os.id}>
            {os.full_name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="subtle" size="sm">
        Apply
      </Button>
    </form>
  );
}
