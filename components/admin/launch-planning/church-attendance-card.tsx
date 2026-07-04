"use client";

import { PButton } from "@/components/pastoral/button";
import { adminUpdateLaunchPlanningAssumptions } from "@/app/(protected)/admin/launch-planning/actions";
import {
  fieldInputClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { eyebrowClassName, sectionClassName } from "./section-styles";

export type ChurchAttendanceCardProps = {
  // L4 (#223): the single source of truth for the headline denominator — the
  // editable `current_church_attendance` assumption, not a time series.
  currentChurchAttendance: number;
  // People currently in active life groups (the numerator).
  currentParticipants: number;
  // current_participants / current_church_attendance, rounded, or null.
  participationPct: number | null;
};

export function ChurchAttendanceCard({
  currentChurchAttendance,
  currentParticipants,
  participationPct,
}: ChurchAttendanceCardProps) {
  // L4 (#223): editing church attendance writes the single
  // `current_church_attendance` assumption (the same key the assumptions form
  // and forecast read). The RPC merges only submitted keys, so posting just
  // this one field leaves every other assumption untouched.
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateLaunchPlanningAssumptions
  );

  return (
    <section className={sectionClassName}>
      <header className="mb-4">
        <span className={eyebrowClassName}>Church attendance</span>
        <h2 className="m-0 mt-1 font-sans text-[18px] font-semibold text-ink">
          % of the church in a group
        </h2>
      </header>

      <div className="mb-1.5 flex items-baseline gap-3">
        <span className="font-sans text-[34px] font-semibold text-ink">
          {participationPct == null ? "—" : `${participationPct}%`}
        </span>
        <span className="font-sans text-sm text-ink2">
          {currentParticipants} in groups
          {currentChurchAttendance > 0
            ? ` of ${currentChurchAttendance} attending`
            : ""}
        </span>
      </div>
      <p className="m-0 mb-[18px] font-sans text-xs text-ink3">
        Update the current church attendance to keep this percentage — and the
        launch forecast — accurate.
      </p>

      <form
        action={formAction}
        className="lg-m-grid-stack grid grid-cols-[minmax(0,200px)_auto] items-end gap-3"
      >
        <div>
          <label
            htmlFor="current_church_attendance"
            className={fieldLabelClassName}
          >
            Current church attendance
          </label>
          <input
            id="current_church_attendance"
            name="current_church_attendance"
            type="number"
            min={0}
            max={100000}
            inputMode="numeric"
            // Required: this is a forecast input with no "blank = clear"
            // meaning. A blank submit would be dropped by readLaunchPlanningForm
            // and rejected with a misleading "Nothing to change", so block it at
            // the browser instead with a clear native prompt.
            required
            defaultValue={currentChurchAttendance}
            className={fieldInputClassName}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </PButton>
          <FormStatus state={state} successText="Saved." />
        </div>
      </form>
    </section>
  );
}
