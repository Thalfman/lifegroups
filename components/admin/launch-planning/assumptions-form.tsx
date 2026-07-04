"use client";

import { NOTE_MAX_CHARS } from "@/lib/shared/limits";
import { adminUpdateLaunchPlanningAssumptions } from "@/app/(protected)/admin/launch-planning/actions";
import { PercentField } from "@/components/admin/launch-planning/percent-field";
import {
  fieldInputClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { ratioToPercent } from "@/lib/admin/launch-planning";
import type { LaunchPlanningAssumptions } from "@/lib/admin/launch-planning";
import { Button } from "@/components/ui/button";

// L5 (#224): the default forecast asks only for the two inputs that need a
// ministry-specific answer — current church attendance (set in the Church
// attendance card) and target group participation, shown as a percentage. The
// rest (growth, average group size, launch buffer, leaders per new group) are
// silently defaulted and remain editable per scenario in the Scenarios tab.
export function LaunchPlanningAssumptionsForm({
  assumptions,
}: {
  assumptions: LaunchPlanningAssumptions;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateLaunchPlanningAssumptions
  );

  return (
    <form action={formAction} className="grid gap-4">
      <p className="m-0 font-sans text-sm leading-[1.55] text-ink2">
        Set the share of attendees you want in a Life Group. Current church
        attendance is set in the Church attendance card above; growth, group
        size, buffer, and leaders per group use sensible defaults you can
        fine-tune per scenario. Leave a field blank to keep its current value.
      </p>

      <PercentField
        id="target_group_participation_pct"
        name="target_group_participation_pct"
        label="Target group participation %"
        defaultRatio={assumptions.target_group_participation_pct}
        maxPercent={100}
        hint={
          <>
            Share of attendees you want in a Life Group, e.g. 60 means 60% (
            {`${ratioToPercent(assumptions.target_group_participation_pct)}%`}{" "}
            today).
          </>
        }
      />

      <div>
        <label htmlFor="notes" className={fieldLabelClassName}>
          Planning notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={NOTE_MAX_CHARS}
          defaultValue={assumptions.notes ?? ""}
          className={`${fieldInputClassName} min-h-20 resize-y`}
          placeholder="Optional context for Julian's eyes only."
        />
        <p className={hintClassName}>
          Admin-only. Not shown anywhere outside this page and never logged in
          audit metadata.
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save forecast"}
        </Button>
        <FormStatus state={state} successText="Forecast saved." />
      </div>
    </form>
  );
}

const hintClassName = "m-0 mt-1 font-sans text-2xs leading-[1.4] text-ink3";
