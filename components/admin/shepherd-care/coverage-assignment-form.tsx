"use client";

import {
  adminAssignShepherdCoverage,
  adminEndShepherdCoverage,
} from "@/app/(protected)/admin/shepherd-care/over-shepherd-actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldInputClassName as FIELD_INPUT,
  fieldLabelClassName as FIELD_LABEL,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";
import type { OverShepherdListRow } from "@/lib/supabase/shepherd-coverage-reads";
import { Button } from "@/components/ui/button";
import { churchTodayIso } from "@/lib/shared/church-time";

// Form anatomy comes from the canonical field styles (design direction §4);
// only the lede spacing below it is local.
const FORM_NOTE = `${formNoteClassName} mb-3`;

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
    <div className="grid gap-3.5">
      {hasActiveOverShepherds ? (
        <form action={assignAction} className="grid gap-3">
          <input
            type="hidden"
            name="shepherd_profile_id"
            value={shepherdProfileId}
          />
          <p className={FORM_NOTE}>
            {currentOverShepherdId
              ? "Choose a different over-shepherd to reassign. The prior assignment will end automatically."
              : "Assign an over-shepherd to cover this shepherd. When the over-shepherd signs in, this shepherd appears among the ones they cover."}
          </p>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3.5">
            <div>
              <label htmlFor="cov-over_shepherd_id" className={FIELD_LABEL}>
                Over-shepherd
              </label>
              <select
                id="cov-over_shepherd_id"
                name="over_shepherd_id"
                required
                // Keyed on the current assignment: the select is uncontrolled,
                // so without a remount a cleared/reassigned coverage (this
                // form's own "Clear coverage", or another session) kept
                // displaying the stale over-shepherd after revalidation.
                key={currentOverShepherdId ?? "unassigned"}
                defaultValue={currentOverShepherdId ?? ""}
                className={FIELD_INPUT}
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
              <label htmlFor="cov-assigned_at" className={FIELD_LABEL}>
                Assigned date
              </label>
              <input
                id="cov-assigned_at"
                name="assigned_at"
                type="date"
                defaultValue={churchTodayIso()}
                max={churchTodayIso()}
                className={FIELD_INPUT}
              />
            </div>
            <div>
              <Button
                type="submit"
                variant="solid"
                size="md"
                disabled={assignPending}
              >
                {assignPending
                  ? "Saving…"
                  : currentOverShepherdId
                    ? "Reassign coverage"
                    : "Assign coverage"}
              </Button>
            </div>
          </div>
          <FormStatus state={assignState} successText="Coverage assigned." />
        </form>
      ) : !currentAssignmentId ? (
        // No active over-shepherds and no active assignment to clear —
        // surface the empty state directly.
        <p className={FORM_NOTE}>
          No active over-shepherds yet. Add one from the over-shepherd manager
          before assigning coverage.
        </p>
      ) : (
        // No active over-shepherds, but an active assignment exists
        // (the assigned over-shepherd was archived after the assignment
        // was made). Allow clearing so admins aren't stuck.
        <p className={FORM_NOTE}>
          The current over-shepherd is archived. Reactivate them from the
          over-shepherd manager, or clear coverage below.
        </p>
      )}

      {currentAssignmentId ? (
        <form
          action={endAction}
          className="grid gap-2 border-t border-lineSoft pt-3"
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
          <p className="m-0 font-sans text-sm leading-normal text-ink2">
            Or clear coverage entirely. The assignment is soft-ended and stays
            in the audit trail.
          </p>
          <div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={endPending}
            >
              {endPending ? "Clearing…" : "Clear coverage"}
            </Button>
          </div>
          <FormStatus state={endState} successText="Coverage cleared." />
        </form>
      ) : null}
    </div>
  );
}
