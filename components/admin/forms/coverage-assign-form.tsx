"use client";

import { PButton } from "@/components/pastoral/button";
import { superAdminAssignCoverage } from "@/app/(protected)/admin/super-admin/coverage-actions";
import { fieldLabelStyle, fieldSelectStyle } from "./field-styles";
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
      className="lg-m-grid-stack"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr auto",
        gap: 12,
        alignItems: "end",
      }}
    >
      <div>
        <label htmlFor="coverage-leader" style={fieldLabelStyle}>
          Leader
        </label>
        <select
          id="coverage-leader"
          name="shepherd_profile_id"
          required
          disabled={noOptions}
          defaultValue=""
          style={fieldSelectStyle}
        >
          <option value="" disabled>
            {leaders.length === 0 ? "No assignable leaders" : "Pick a leader…"}
          </option>
          {leaders.map((l) => (
            <option key={l.profile_id} value={l.profile_id}>
              {l.full_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="coverage-over" style={fieldLabelStyle}>
          Over-Shepherd
        </label>
        <select
          id="coverage-over"
          name="over_shepherd_id"
          required
          disabled={noOptions}
          defaultValue=""
          style={fieldSelectStyle}
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
