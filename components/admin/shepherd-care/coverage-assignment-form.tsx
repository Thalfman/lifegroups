"use client";

import { PButton } from "@/components/pastoral/button";
import {
  adminAssignShepherdCoverage,
  adminEndShepherdCoverage,
} from "@/app/(protected)/admin/shepherd-care/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
} from "@/components/admin/forms/field-styles";
import { P, fontBody } from "@/lib/pastoral";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { OverShepherdListRow } from "@/lib/supabase/read-models";

// `defaultValue` uses the caller's LOCAL calendar day for the same
// rationale as log-interaction-form.tsx — keep the picker on the
// admin's natural "today" without rejecting it server-side.
function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function CoverageAssignmentForm({
  shepherdProfileId,
  activeOverShepherds,
  currentAssignmentId,
  currentOverShepherdId,
}: {
  shepherdProfileId: string;
  activeOverShepherds: OverShepherdListRow[];
  currentAssignmentId: string | null;
  currentOverShepherdId: string | null;
}) {
  const {
    state: assignState,
    formAction: assignAction,
    pending: assignPending,
  } = useActionForm<{ id: string }>(adminAssignShepherdCoverage);
  const {
    state: endState,
    formAction: endAction,
    pending: endPending,
  } = useActionForm<{ id: string }>(adminEndShepherdCoverage);

  const hasActiveOverShepherds = activeOverShepherds.length > 0;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {hasActiveOverShepherds ? (
        <form action={assignAction} style={{ display: "grid", gap: 12 }}>
          <input
            type="hidden"
            name="shepherd_profile_id"
            value={shepherdProfileId}
          />
          <p style={formNoteStyle}>
            {currentOverShepherdId
              ? "Choose a different over-shepherd to reassign — the prior assignment will end automatically."
              : "Assign an over-shepherd to cover this leader. The over-shepherd will not see anything in the app; this is for Julian's tracking only."}
          </p>
          <div className="lg-m-grid-stack" style={formGridStyle}>
            <div>
              <label htmlFor="cov-over_shepherd_id" style={fieldLabelStyle}>
                Over-shepherd
              </label>
              <select
                id="cov-over_shepherd_id"
                name="over_shepherd_id"
                required
                defaultValue={currentOverShepherdId ?? ""}
                style={fieldSelectStyle}
              >
                <option value="" disabled>
                  Select…
                </option>
                {activeOverShepherds.map((os) => (
                  <option key={os.id} value={os.id}>
                    {os.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cov-assigned_at" style={fieldLabelStyle}>
                Assigned date
              </label>
              <input
                id="cov-assigned_at"
                name="assigned_at"
                type="date"
                defaultValue={todayLocalIso()}
                max={todayLocalIso()}
                style={fieldInputStyle}
              />
            </div>
            <div>
              <PButton
                type="submit"
                tone="solid"
                size="md"
                disabled={assignPending}
              >
                {assignPending
                  ? "Saving…"
                  : currentOverShepherdId
                    ? "Reassign coverage"
                    : "Assign coverage"}
              </PButton>
            </div>
          </div>
          <FormStatus state={assignState} successText="Coverage assigned." />
        </form>
      ) : !currentAssignmentId ? (
        // No active over-shepherds and no active assignment to clear —
        // surface the empty state directly.
        <p style={{ ...formNoteStyle, color: P.ink2 }}>
          No active over-shepherds yet. Add one from the over-shepherd manager
          before assigning coverage.
        </p>
      ) : (
        // No active over-shepherds, but an active assignment exists
        // (the assigned over-shepherd was archived after the assignment
        // was made). Allow clearing so admins aren't stuck.
        <p style={{ ...formNoteStyle, color: P.ink2 }}>
          The current over-shepherd is archived. Reactivate them from the
          over-shepherd manager, or clear coverage below.
        </p>
      )}

      {currentAssignmentId ? (
        <form
          action={endAction}
          style={{
            display: "grid",
            gap: 8,
            borderTop: `1px solid ${P.line2}`,
            paddingTop: 12,
          }}
        >
          <input
            type="hidden"
            name="assignment_id"
            value={currentAssignmentId}
          />
          <input
            type="hidden"
            name="shepherd_profile_id"
            value={shepherdProfileId}
          />
          <p
            style={{
              ...formNoteStyle,
              fontFamily: fontBody,
              color: P.ink2,
              margin: 0,
            }}
          >
            Or clear coverage entirely — the assignment is soft-ended and stays
            in the audit trail.
          </p>
          <div>
            <PButton type="submit" tone="terra" size="md" disabled={endPending}>
              {endPending ? "Clearing…" : "Clear coverage"}
            </PButton>
          </div>
          <FormStatus state={endState} successText="Coverage cleared." />
        </form>
      ) : null}
    </div>
  );
}
