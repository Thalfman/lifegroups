"use client";

// Group health as a triage workflow (Admin Interaction Model PRD req 2, the
// reference implementation for the Editing Pattern). The list is a review
// table — one row per group, no per-row save buttons and no inline edit form.
// Opening a group reveals its rating fields in the shared EditingSurface
// drawer, and saving there affects only that group.
//
// This is the ungated shell + table scaffolding. The provisional triage
// filters use only what is honestly derivable today; the gated definitions
// (director thresholds, attendance-trend direction, follow-up flags) are
// deferred to step 05 — see FILTERS below and docs/retros for the data
// fallbacks that are documented rather than invented.

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import { useRouter } from "next/navigation";
import type { GroupHealthOverviewRow } from "@/lib/admin/group-health-read";
import {
  adminSetGroupHealthRatings,
  adminRecomputeGroupHealthAssessment,
} from "@/app/(protected)/admin/group-health/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClass,
  fieldInputStyle,
  fieldLabelStyle,
} from "@/components/admin/forms/field-styles";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { PButton } from "@/components/pastoral/button";
import { dateLabel } from "@/lib/calendar/occurrences";
import { P, fontBody, fontSans } from "@/lib/pastoral";

// --- Provisional triage filters --------------------------------------------
// "Not assessed" and "Needs rating" are derivable from today's data with no
// director input, so they ship as working filters. "Watch" (below the
// director's grade/attendance threshold) and "Needs follow-up" (an open flag
// on the latest assessment) have no ungated data source yet — the threshold is
// gated (step 05) and no follow-up/flag column exists on the assessment — so
// they are intentionally omitted here rather than faked with placeholder logic.
type FilterKey = "all" | "not_assessed" | "needs_rating";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All groups" },
  { key: "not_assessed", label: "Not assessed" },
  { key: "needs_rating", label: "Needs rating" },
];

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
  filter: FilterKey
): boolean {
  if (filter === "all") return true;
  if (filter === "not_assessed") return row.unassessed;
  // Needs rating: an assessment exists (not unassessed) but a required 1–5
  // rating is still missing.
  return (
    !row.unassessed &&
    (row.spiritual_growth_score === null || row.group_question_score === null)
  );
}

// "Saturday, May 16" via the shared UTC-anchored label, so date columns don't
// drift with the runtime timezone. last_check_in_week is a date; last_saved_at
// is a timestamp — slice it to its date part before labelling.
function dateCell(iso: string | null): string {
  if (!iso) return "—";
  return dateLabel(iso.slice(0, 10));
}

const thStyle: CSSProperties = {
  padding: "0 14px 8px 0",
  textAlign: "left",
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 700,
};

const tdStyle: CSSProperties = {
  padding: "10px 14px 10px 0",
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
  borderTop: `1px solid ${P.line}`,
  verticalAlign: "top",
};

export function GroupHealthTriage({
  rows,
  period,
  spiritualGrowthLabel,
  groupQuestionLabel,
}: {
  rows: GroupHealthOverviewRow[];
  period: string;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  // Unsaved-edit flag, written by the open editor's form and read on close so
  // we can warn before discarding. A ref (not state) because only the close
  // handlers read it, and we don't want edits to re-render the list.
  const dirtyRef = useRef(false);

  const visible = rows.filter((row) => matchesFilter(row, filter));
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
    <div style={{ display: "grid", gap: 18 }}>
      <div
        className="lg-m-filterbar"
        role="group"
        aria-label="Filter groups"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? P.ink : P.line}`,
                background: active ? P.ink : "transparent",
                color: active ? P.surface : P.ink2,
                fontFamily: fontSans,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Group</th>
            <th style={thStyle}>Last check-in</th>
            <th style={thStyle}>Attendance (8-wk avg)</th>
            <th style={thStyle}>Grade</th>
            <th style={thStyle}>Missing ratings</th>
            <th style={thStyle}>Last saved</th>
            <th style={thStyle}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td style={{ ...tdStyle, color: P.ink2 }} colSpan={7}>
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
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {row.group_name}
                  </td>
                  <td style={tdStyle}>{dateCell(row.last_check_in_week)}</td>
                  <td style={tdStyle}>
                    {row.attendance_pct === null
                      ? "—"
                      : `${Math.round(row.attendance_pct)}% (${row.attendance_weeks_counted} wk)`}
                    {row.stale ? (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 11,
                          color: P.mustardTextStrong,
                        }}
                      >
                        stale
                      </span>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    {row.computed_letter ??
                      (row.unassessed ? "Not assessed" : "—")}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      color: missing.length ? P.terraTextStrong : P.ink3,
                    }}
                  >
                    {missing.length === 0 ? "None" : missing.join(", ")}
                  </td>
                  <td style={tdStyle}>{dateCell(row.last_saved_at)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
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
}: {
  row: GroupHealthOverviewRow | null;
  period: string;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
  dirtyRef: MutableRefObject<boolean>;
  onRequestClose: () => void;
  onSaved: () => void;
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
}: {
  row: GroupHealthOverviewRow;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
  dirtyRef: MutableRefObject<boolean>;
  onSaved: () => void;
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
        style={{ display: "grid", gap: 16 }}
      >
        <input type="hidden" name="group_id" value={row.group_id} />

        <div>
          <label htmlFor={`gh-growth-${row.group_id}`} style={fieldLabelStyle}>
            {spiritualGrowthLabel}
          </label>
          <input
            id={`gh-growth-${row.group_id}`}
            className={fieldInputClass}
            style={fieldInputStyle}
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
            style={fieldLabelStyle}
          >
            {groupQuestionLabel}
          </label>
          <input
            id={`gh-question-${row.group_id}`}
            className={fieldInputClass}
            style={fieldInputStyle}
            type="number"
            name="group_question_score"
            min={1}
            max={5}
            defaultValue={row.group_question_score ?? ""}
          />
        </div>

        <div>
          <label htmlFor={`gh-note-${row.group_id}`} style={fieldLabelStyle}>
            Spiritual-growth note
          </label>
          <textarea
            id={`gh-note-${row.group_id}`}
            className={fieldInputClass}
            style={{ ...fieldInputStyle, minHeight: 76, resize: "vertical" }}
            name="spiritual_growth_note"
            maxLength={2000}
            defaultValue={row.spiritual_growth_note ?? ""}
          />
        </div>

        <FormStatus state={ratings.state} successText="Saved." />
        <FormStatus state={recompute.state} successText="Grade saved." />
      </form>

      <div
        style={{
          marginTop: 4,
          paddingTop: 14,
          borderTop: `1px solid ${P.line}`,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
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
    </>
  );
}
