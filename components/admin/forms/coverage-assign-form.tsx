"use client";

import { useActionState, useEffect, useRef } from "react";
import { PButton } from "@/components/pastoral/button";
import { superAdminAssignCoverage } from "@/app/(protected)/admin/super-admin/coverage-actions";
import {
  errorTextStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  successTextStyle,
} from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

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
  const [state, formAction, pending] = useActionState<State, FormData>(
    superAdminAssignCoverage,
    undefined
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

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
      {state?.ok ? (
        <span style={successTextStyle}>Coverage assigned.</span>
      ) : null}
      {state && !state.ok ? (
        <p style={errorTextStyle}>{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}
