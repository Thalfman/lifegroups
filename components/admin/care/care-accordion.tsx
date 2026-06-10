import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
import { CareLeaderPanel } from "@/components/admin/care/care-leader-panel";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import type { CareAccordionPane } from "@/lib/admin/care-accordion";

// The canonical Care view (#373, ADR 0016): a collapsible accordion grouped by
// Over-Shepherd, COLLAPSED BY DEFAULT. Each pane expands to the Leaders that
// Over-Shepherd covers; opening a Leader reveals their Leader Care Status and
// the placeholder grade/notes/prayer slots (see CareLeaderPanel). An Unassigned
// pane catches Leaders with no active Over-Shepherd coverage. Since the
// four-tab consolidation (#477) this region is also the home of coverage
// triage — the Unassigned pane and the "Manage coverage →" link below are
// what remains of the retired Coverage tab.
//
// Built on native <details>/<summary> so the disclosure works without client
// JS (and stays collapsed by default), matching the existing
// SuperAdminCollapsibleSection pattern. Coverage assignments are the backbone;
// there are deliberately NO headcounts here — only a "N leaders" pane size so
// the scan reads.

function Chevron() {
  return (
    <span aria-hidden="true" className="inline-flex text-ink3">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M4 2l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function leaderCountLabel(count: number): string {
  return `${count} leader${count === 1 ? "" : "s"}`;
}

function CarePane({
  pane,
  isSuperAdmin,
}: {
  pane: CareAccordionPane;
  isSuperAdmin: boolean;
}) {
  return (
    <details
      className={cn(
        "rounded-md border bg-surface",
        pane.isUnassigned ? "border-lineSoft" : "border-line"
      )}
    >
      <summary className="flex cursor-pointer items-center gap-2.5 rounded-md px-4 py-3.5 transition-colors duration-150 hover:bg-surfaceAlt">
        <Chevron />
        <span
          className={cn(
            "min-w-0 flex-1 font-sans text-base font-semibold [overflow-wrap:anywhere]",
            pane.isUnassigned ? "text-ink2" : "text-ink"
          )}
        >
          {pane.overShepherdName}
        </span>
        <span className="whitespace-nowrap font-sans text-sm text-ink3">
          {leaderCountLabel(pane.leaders.length)}
        </span>
      </summary>

      <div className="grid gap-2.5 px-4 pb-4 pt-1">
        {pane.leaders.length === 0 ? (
          <p className="m-0 font-sans text-sm italic text-ink3">
            {pane.isUnassigned
              ? "Every leader has an over-shepherd."
              : "No leaders covered yet."}
          </p>
        ) : (
          pane.leaders.map((leader) => (
            <CareLeaderPanel key={leader.profileId} leader={leader} />
          ))
        )}
        {/* SAD9: super-admin-only permanent delete of the over-shepherd record
            itself. Lives in the expanded body (not the summary) so it can't
            fight the <details> disclosure toggle. The preflight surfaces — and
            the engine refuses — a delete while active coverage assignments still
            reference this over-shepherd, so they must be cleared first. */}
        {isSuperAdmin && pane.overShepherdId && !pane.isUnassigned ? (
          <div className="flex justify-end border-t border-lineSoft pt-2.5">
            <SuperAdminInlineDelete
              entityType="over_shepherd"
              id={pane.overShepherdId}
              label={pane.overShepherdName}
            />
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function CareAccordion({
  panes,
  isSuperAdmin = false,
}: {
  panes: CareAccordionPane[];
  isSuperAdmin?: boolean;
}) {
  return (
    <div className="grid gap-4">
      {/* Coverage maintenance is NOT rebuilt here (#373 req 4): link out to the
          existing over-shepherd coverage surface, which still resolves under
          /admin/shepherd-care (ADR 0008/0009). Since #477 this link is the
          coverage-management entry the retired Coverage tab used to carry. */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="m-0 font-sans text-sm text-ink2">
          Leaders grouped by their over-shepherd.
        </p>
        <Link
          href="/admin/shepherd-care/over-shepherds"
          className={buttonClassName("ghost", "sm", "whitespace-nowrap")}
        >
          Manage coverage →
        </Link>
      </div>

      <div className="grid gap-3">
        {panes.map((pane) => (
          <CarePane
            key={pane.overShepherdId ?? "unassigned"}
            pane={pane}
            isSuperAdmin={isSuperAdmin}
          />
        ))}
      </div>
    </div>
  );
}
