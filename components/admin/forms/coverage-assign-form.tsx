"use client";

import { PButton } from "@/components/pastoral/button";
import { superAdminAssignCoverage } from "@/app/(protected)/admin/super-admin/coverage-actions";
import { fieldLabelClassName, fieldSelectClassName } from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

type OverShepherd = { id: string; full_name: string };
type Leader = { profile_id: string; full_name: string };

// Phase SAC.4 (#164): assign a Leader to an Over-Shepherd's coverage.
export function CoverageAssignForm({
  overShepherds,
  leaders,
}: {
  overShepherds: OverShepherd[];
  leaders: Leader[];
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    superAdminAssignCoverage,
    { resetOnSuccess: true }
  );

  const noOptions = overShepherds.length === 0 || leaders.length === 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]"
    >
      <div>
        <label htmlFor="coverage-leader" className={fieldLabelClassName}>
          Shepherd
        </label>
        <select
          id="coverage-leader"
          name="shepherd_profile_id"
          required
          disabled={noOptions}
          defaultValue=""
          className={fieldSelectClassName}
        >
          <option value="" disabled>
            {leaders.length === 0
              ? "No assignable shepherds"
              : "Pick a shepherd…"}
          </option>
          {leaders.map((l) => (
            <option key={l.profile_id} value={l.profile_id}>
              {l.full_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="coverage-over" className={fieldLabelClassName}>
          Over-Shepherd
        </label>
        <select
          id="coverage-over"
          name="over_shepherd_id"
          required
          disabled={noOptions}
          defaultValue=""
          className={fieldSelectClassName}
        >
          <option value="" disabled>
            {overShepherds.length === 0
              ? "No active over-shepherds"
              : "Pick an over-shepherd…"}
          </option>
          {overShepherds.map((o) => (
            <option key={o.id} value={o.id}>
              {o.full_name}
            </option>
          ))}
        </select>
      </div>
      <PButton
        type="submit"
        tone="terra"
        size="md"
        disabled={pending || noOptions}
      >
        {pending ? "Saving…" : "Assign"}
      </PButton>
      <FormStatus state={state} successText="Coverage assigned." />
    </form>
  );
}
