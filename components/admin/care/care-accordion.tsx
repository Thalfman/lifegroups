import Link from "next/link";
import { cn } from "@/lib/utils";
import { CareLeaderPanel } from "@/components/admin/care/care-leader-panel";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { buttonClassName } from "@/components/ui/button";
import type {
  CareAccordionPane,
  CareGradeEntryBundle,
} from "@/lib/admin/care-accordion";

// The canonical Care view (#373, ADR 0016): a collapsible accordion grouped by
// Over-Shepherd, COLLAPSED BY DEFAULT. Each pane expands to the Leaders that
// Over-Shepherd covers; opening a Leader reveals their Leader Care Status and
// the placeholder grade/notes/prayer slots (see CareLeaderPanel). An Unassigned
// pane catches Leaders with no active Over-Shepherd coverage. Since the
// four-tab consolidation (#477) this region is also the home of coverage
// triage — the Unassigned pane is what remains of the retired Coverage tab
// (coverage maintenance itself still resolves by direct URL under
// /admin/shepherd-care/over-shepherds, off-nav per ADR 0008/0009).
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
  gradeEntry,
}: {
  pane: CareAccordionPane;
  isSuperAdmin: boolean;
  gradeEntry?: CareGradeEntryBundle;
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
        {pane.isUnassigned && pane.leaders.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-lineSoft bg-bg/70 px-3 py-2.5">
            <p className="m-0 font-sans text-sm text-ink2">
              These leaders need over-shepherd coverage.
            </p>
            {isSuperAdmin ? (
              <Link
                href="/admin/shepherd-care/over-shepherds"
                className={buttonClassName("ghost", "sm")}
              >
                Assign coverage
              </Link>
            ) : (
              <p className="m-0 font-sans text-sm text-ink3">
                Ask a super admin to assign coverage.
              </p>
            )}
          </div>
        ) : null}
        {pane.leaders.length === 0 ? (
          <p className="m-0 font-sans text-sm italic text-ink3">
            {pane.isUnassigned
              ? "Every leader has an over-shepherd."
              : "No leaders covered yet."}
          </p>
        ) : (
          pane.leaders.map((leader) => (
            <CareLeaderPanel
              key={leader.profileId}
              leader={leader}
              gradeEntry={gradeEntry}
            />
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
  gradeEntry,
}: {
  panes: CareAccordionPane[];
  isSuperAdmin?: boolean;
  // ADR 0023 — the inline grade editors' inputs; passed straight through to
  // each leader panel so the pure accordion model stays untouched.
  gradeEntry?: CareGradeEntryBundle;
}) {
  const hasAnyLeaders = panes.some((pane) => pane.leaders.length > 0);
  const peopleHref = isSuperAdmin
    ? "/admin/super-admin#people-import"
    : "/admin/people";
  return (
    <div className="grid gap-4">
      <p className="m-0 font-sans text-sm text-ink2">
        Leaders grouped by their over-shepherd.
      </p>

      <div className="grid gap-3">
        {!hasAnyLeaders ? (
          <div className="grid justify-items-start gap-3 rounded-md border border-dashed border-line bg-surface px-4 py-4">
            <p className="m-0 font-sans text-sm text-ink2">
              No active leaders are available for care coverage yet.
            </p>
            <Link href={peopleHref} className={buttonClassName("ghost", "sm")}>
              {isSuperAdmin ? "Import people" : "Open People"}
            </Link>
          </div>
        ) : (
          panes.map((pane) => (
            <CarePane
              key={pane.overShepherdId ?? "unassigned"}
              pane={pane}
              isSuperAdmin={isSuperAdmin}
              gradeEntry={gradeEntry}
            />
          ))
        )}
      </div>
    </div>
  );
}
