"use client";

// Group health as a triage workflow (Admin Interaction Model PRD req 2, the
// reference implementation for the Editing Pattern). The list is a review
// table — one row per group, no per-row save buttons and no inline edit form.
// Opening a group reveals its rating fields in the shared EditingSurface
// drawer, and saving there affects only that group.
//
// Admin IM 05 (#265) lands the final, director-confirmed triage filters on top
// of the step-04 shell: Not assessed, Needs rating, Watch, and Needs follow-up.
// The thresholds the gated filters need (Watch grade, attendance decline
// margin) come from Settings, not hard-coded here — see matchesFilter and the
// director sign-off recorded on the issue.

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import type { GroupHealthOverviewRow } from "@/lib/admin/group-health-read";
import { gradeAtOrBelow } from "@/lib/admin/group-health";
import type { GroupHealthLetter } from "@/types/enums";
import {
  adminSetGroupHealthRatings,
  adminRecomputeGroupHealthAssessment,
} from "@/app/(protected)/admin/group-health/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { AttentionResetEntityButton } from "@/components/admin/attention-reset-entity-button";
import { SuperAdminOnlyBadge } from "@/components/admin/super-admin-only-badge";
import { PButton } from "@/components/pastoral/button";
import { buttonClassName } from "@/components/ui/button";
import { usePersistedViewState } from "@/lib/hooks/use-persisted-view-state";
import { dateLabel } from "@/lib/calendar/occurrences";
import { cn } from "@/lib/utils";

// --- Triage filters (director-confirmed, Admin IM 05 / #265) ----------------
//   * Not assessed — no rating has ever been recorded.
//   * Needs rating — an assessment exists but a required 1–5 rating is missing.
//     (No time-staleness clause: a complete assessment never ages back in.)
//   * Watch — the latest grade is at or below the director's Watch threshold
//     (default C), OR attendance is declining (recent vs prior 4-week window).
//   * Needs follow-up — the assessment's open follow-up flag is set.
type FilterKey =
  | "all"
  | "not_assessed"
  | "needs_rating"
  | "watch"
  | "needs_follow_up";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All groups" },
  { key: "not_assessed", label: "Not assessed" },
  { key: "needs_rating", label: "Needs rating" },
  { key: "watch", label: "Watch" },
  { key: "needs_follow_up", label: "Needs follow-up" },
];

const FILTER_KEYS = new Set<string>(FILTERS.map((f) => f.key));

// Saved filter restore (#263): accept only a string that is still one of the
// defined triage filters, so a renamed/removed filter from an older build
// falls back to "all" instead of leaving the table on a dead selection.
function isFilterKey(value: unknown): value is FilterKey {
  return typeof value === "string" && FILTER_KEYS.has(value);
}

// A required rating is missing when its 1–5 score is null.
function missingRatings(
  row: GroupHealthOverviewRow,
  spiritualGrowthLabel: string,
  groupQuestionLabel: string
): string[] {
  const missing: string[] = [];
  if (row.spiritual_growth_score === null) missing.push(spiritualGrowthLabel);
  if (row.group_question_score === null) missing.push(groupQuestionLabel);
  return missing;
}

function matchesFilter(
  row: GroupHealthOverviewRow,
  filter: FilterKey,
  watchGrade: GroupHealthLetter
): boolean {
  if (filter === "all") return true;
  if (filter === "not_assessed") return row.unassessed;
  if (filter === "needs_rating") {
    // An assessment exists (not unassessed) but a required 1–5 rating is still
    // missing.
    return (
      !row.unassessed &&
      (row.spiritual_growth_score === null || row.group_question_score === null)
    );
  }
  if (filter === "watch") {
    // Latest grade at or below the director's threshold, OR declining
    // attendance (the read model already applied the director's decline margin).
    return (
      gradeAtOrBelow(row.computed_letter, watchGrade) ||
      row.attendance_declining
    );
  }
  // Needs follow-up: the open flag on the latest assessment.
  return row.needs_follow_up;
}

// "Saturday, May 16" via the shared UTC-anchored label, so date columns don't
// drift with the runtime timezone. last_check_in_week is a date; last_saved_at
// is a timestamp — slice it to its date part before labelling.
function dateCell(iso: string | null): string {
  if (!iso) return "—";
  return dateLabel(iso.slice(0, 10));
}

// DataTable conventions (docs/design-direction.md §4 Tables & lists): 12px
// sentence-case ink3 header row, 13px cells, lineSoft row separators.
const TH = "pb-2 pr-3.5 text-left font-sans text-xs font-semibold text-ink3";

const TD =
  "border-t border-lineSoft py-2.5 pr-3.5 align-top font-sans text-sm text-ink";

// Design-system form field classes (§4 Forms): tracked-uppercase survives in
// form field labels; inputs are full-width, rounded-sm, line-bordered, with
// the global focus ring. `lg-m-input` keeps the ≥16px mobile font guard.
const FIELD_LABEL =
  "mb-1.5 block font-sans text-xs font-semibold uppercase tracking-wide text-ink3";
const FIELD_INPUT =
  "lg-m-input w-full rounded-sm border border-line bg-surface px-3 py-2.5 font-sans text-base text-ink";

export function GroupHealthTriage({
  rows,
  period,
  spiritualGrowthLabel,
  groupQuestionLabel,
  watchGrade,
  viewerId,
  isSuperAdmin = false,
}: {
  rows: GroupHealthOverviewRow[];
  period: string;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
  // The director's Watch grade threshold, sourced from Settings (#265).
  watchGrade: GroupHealthLetter;
  // Signed-in profile id, used only to scope this admin's saved filter (#263).
  viewerId?: string | null;
  // health-checks-reset: gates the super-admin-only per-group "Reset attention"
  // control inside the editor drawer.
  isSuperAdmin?: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  // Saved views & filters (PRD req 12, #263): remember the chosen triage
  // filter per admin across reloads and return visits.
  usePersistedViewState({
    surface: "group-health",
    scopeId: viewerId,
    snapshot: filter,
    restore: setFilter,
    validate: isFilterKey,
  });
  // Unsaved-edit flag, written by the open editor's form and read on close so
  // we can warn before discarding. A ref (not state) because only the close
  // handlers read it, and we don't want edits to re-render the list.
  const dirtyRef = useRef(false);

  const visible = rows.filter((row) => matchesFilter(row, filter, watchGrade));
  const openRow = rows.find((r) => r.group_id === openGroupId) ?? null;

  const requestClose = () => {
    if (
      dirtyRef.current &&
      !window.confirm("Discard unsaved changes to this group's ratings?")
    ) {
      return;
    }
    dirtyRef.current = false;
    setOpenGroupId(null);
  };

  // Close without prompting (the edit was saved / there is nothing to discard).
  const forceClose = () => {
    dirtyRef.current = false;
    setOpenGroupId(null);
  };

  return (
    <div className="grid gap-[18px]">
      <div
        role="group"
        aria-label="Filter groups"
        className="flex flex-col gap-2.5 md:flex-row md:flex-wrap md:gap-2"
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              className={cn(
                buttonClassName(active ? "solid" : "ghost", "sm"),
                "w-full md:w-auto"
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Phone usability (Admin Interaction Model req 13): a seven-column data
          table cannot fit a 375px viewport, so the table scrolls inside its own
          region rather than forcing the whole page to scroll horizontally —
          matching the other admin tables (care directory, scenarios). */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={TH}>Group</th>
              <th className={TH}>Last check-in</th>
              <th className={TH}>Attendance (8-wk avg)</th>
              <th className={TH}>Grade</th>
              <th className={TH}>Missing ratings</th>
              <th className={TH}>Last saved</th>
              <th className={TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className={cn(TD, "text-ink2")} colSpan={7}>
                  {rows.length === 0
                    ? "No active groups to assess yet."
                    : "No groups match this filter."}
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const missing = missingRatings(
                  row,
                  spiritualGrowthLabel,
                  groupQuestionLabel
                );
                return (
                  <tr key={row.group_id}>
                    <td className={cn(TD, "font-semibold")}>
                      {row.group_name}
                    </td>
                    <td className={TD}>{dateCell(row.last_check_in_week)}</td>
                    <td className={TD}>
                      {row.attendance_pct === null
                        ? "—"
                        : `${Math.round(row.attendance_pct)}% (${row.attendance_weeks_counted} wk)`}
                      {row.stale ? (
                        <span className="ml-1.5 text-2xs text-amberText">
                          stale
                        </span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      {row.computed_letter ??
                        (row.unassessed ? "Not assessed" : "—")}
                    </td>
                    <td
                      className={cn(
                        TD,
                        missing.length ? "text-clayDeep" : "text-ink3"
                      )}
                    >
                      {missing.length === 0 ? "None" : missing.join(", ")}
                    </td>
                    <td className={TD}>{dateCell(row.last_saved_at)}</td>
                    <td className={cn(TD, "text-right")}>
                      <PButton
                        tone="ghost"
                        size="sm"
                        aria-label={`Open ${row.group_name} health editor`}
                        onClick={() => {
                          dirtyRef.current = false;
                          setOpenGroupId(row.group_id);
                        }}
                      >
                        Open
                      </PButton>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* One always-mounted drawer (open toggled), so Radix owns the focus trap
          and focus restore natively — matching the established calendar drawer
          and keeping the focus contract inside the reusable surface, not each
          consumer. */}
      <GroupHealthEditorDrawer
        row={openRow}
        period={period}
        spiritualGrowthLabel={spiritualGrowthLabel}
        groupQuestionLabel={groupQuestionLabel}
        dirtyRef={dirtyRef}
        onRequestClose={requestClose}
        onSaved={forceClose}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}

function GroupHealthEditorDrawer({
  row,
  period,
  spiritualGrowthLabel,
  groupQuestionLabel,
  dirtyRef,
  onRequestClose,
  onSaved,
  isSuperAdmin,
}: {
  row: GroupHealthOverviewRow | null;
  period: string;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
  dirtyRef: MutableRefObject<boolean>;
  onRequestClose: () => void;
  onSaved: () => void;
  isSuperAdmin: boolean;
}) {
  return (
    <EditingSurface
      open={row !== null}
      onRequestClose={onRequestClose}
      eyebrow="Group health"
      title={row?.group_name ?? ""}
      description={
        row
          ? `Ratings for ${period}. Saving recomputes this group's grade and writes the month's snapshot — no other group is affected.`
          : undefined
      }
      closeLabel={row ? `Close ${row.group_name} health editor` : "Close"}
    >
      {row ? (
        // Keyed per group so the rating fields + action state reset when a
        // different group is opened, while the Dialog itself stays mounted.
        <GroupHealthEditorBody
          key={row.group_id}
          row={row}
          spiritualGrowthLabel={spiritualGrowthLabel}
          groupQuestionLabel={groupQuestionLabel}
          dirtyRef={dirtyRef}
          onSaved={onSaved}
          isSuperAdmin={isSuperAdmin}
        />
      ) : null}
    </EditingSurface>
  );
}

// The rating editor inside the drawer. Reuses the existing audited server
// actions, so saving here is the same write path as before — only the surface
// changed (out of the list, one group at a time).
function GroupHealthEditorBody({
  row,
  spiritualGrowthLabel,
  groupQuestionLabel,
  dirtyRef,
  onSaved,
  isSuperAdmin,
}: {
  row: GroupHealthOverviewRow;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
  dirtyRef: MutableRefObject<boolean>;
  onSaved: () => void;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const ratings = useActionForm(adminSetGroupHealthRatings);
  const recompute = useActionForm(adminRecomputeGroupHealthAssessment);

  // A successful save closes the drawer and refreshes the list so the new grade
  // / last-saved show immediately (the action revalidates the route too). This
  // instance is keyed per group, so `saved` only transitions false→true once.
  const saved = Boolean(ratings.state?.ok || recompute.state?.ok);
  useEffect(() => {
    if (!saved) return;
    dirtyRef.current = false;
    router.refresh();
    onSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const markDirty = () => {
    setDirty(true);
    dirtyRef.current = true;
  };

  const formId = `gh-ratings-${row.group_id}`;

  return (
    <>
      <form
        id={formId}
        ref={ratings.formRef}
        action={ratings.formAction}
        onChange={markDirty}
        className="grid gap-4"
      >
        <input type="hidden" name="group_id" value={row.group_id} />

        <div>
          <label htmlFor={`gh-growth-${row.group_id}`} className={FIELD_LABEL}>
            {spiritualGrowthLabel}
          </label>
          <input
            id={`gh-growth-${row.group_id}`}
            className={FIELD_INPUT}
            type="number"
            name="spiritual_growth_score"
            min={1}
            max={5}
            defaultValue={row.spiritual_growth_score ?? ""}
          />
        </div>

        <div>
          <label
            htmlFor={`gh-question-${row.group_id}`}
            className={FIELD_LABEL}
          >
            {groupQuestionLabel}
          </label>
          <input
            id={`gh-question-${row.group_id}`}
            className={FIELD_INPUT}
            type="number"
            name="group_question_score"
            min={1}
            max={5}
            defaultValue={row.group_question_score ?? ""}
          />
        </div>

        <div>
          <label htmlFor={`gh-note-${row.group_id}`} className={FIELD_LABEL}>
            Spiritual-growth note
          </label>
          <textarea
            id={`gh-note-${row.group_id}`}
            className={cn(FIELD_INPUT, "min-h-[76px] resize-y")}
            name="spiritual_growth_note"
            maxLength={2000}
            defaultValue={row.spiritual_growth_note ?? ""}
          />
        </div>

        <label
          htmlFor={`gh-followup-${row.group_id}`}
          className="flex cursor-pointer items-start gap-2 font-sans text-base text-ink"
        >
          <input
            id={`gh-followup-${row.group_id}`}
            type="checkbox"
            name="needs_follow_up"
            defaultChecked={row.needs_follow_up}
            aria-label={`Flag ${row.group_name} as needing follow-up`}
            className="mt-[3px]"
          />
          {/* The currently-displayed flag (which may be carried from a prior
              month), so an empty "uncheck to close the action" save isn't
              rejected as a no-op — it must be able to write the current-month
              needs_follow_up=false row that supersedes the carried flag. */}
          <input
            type="hidden"
            name="prior_needs_follow_up"
            value={row.needs_follow_up ? "true" : "false"}
          />
          <span>
            Needs follow-up
            <span className="mt-0.5 block text-sm text-ink3">
              Keep this group on the follow-up filter until the action is
              closed.
            </span>
          </span>
        </label>

        <FormStatus state={ratings.state} successText="Saved." />
        <FormStatus state={recompute.state} successText="Grade saved." />
      </form>

      <div className="mt-1 flex flex-wrap justify-end gap-2.5 border-t border-line pt-3.5">
        {/* Recompute grades from the last *saved* ratings, so it's disabled while
            there are unsaved edits — otherwise it would silently discard them. */}
        <form action={recompute.formAction}>
          <input type="hidden" name="group_id" value={row.group_id} />
          <PButton
            type="submit"
            tone="ghost"
            size="sm"
            disabled={dirty || recompute.pending}
            aria-label={`Recompute ${row.group_name} grade`}
            title={dirty ? "Save your rating edits first" : undefined}
          >
            {recompute.pending ? "Saving…" : "Save grade only"}
          </PButton>
        </form>
        <PButton
          type="submit"
          tone="terra"
          size="sm"
          form={formId}
          disabled={ratings.pending}
          aria-label={`Save ${row.group_name} health rating`}
        >
          {ratings.pending ? "Saving…" : "Save rating"}
        </PButton>
      </div>

      {isSuperAdmin ? (
        <div className="mt-3.5 grid gap-1.5 border-t border-line pt-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-sans text-xs font-bold text-ink">
              Reset attention
            </span>
            <SuperAdminOnlyBadge />
          </div>
          <p className="m-0 font-sans text-xs text-ink2">
            Clear this group from the “overdue or missing health checks” card
            with a fresh-start baseline and clear any open “needs follow-up”
            flag — it re-surfaces naturally once a new due week passes without a
            submission. Recoverable from Super Admin → Danger Zone.
          </p>
          <AttentionResetEntityButton
            surface="health"
            entityId={row.group_id}
            entityLabel={row.group_name}
          />
        </div>
      ) : null}
    </>
  );
}
