"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { superAdminEndCoverage } from "@/app/(protected)/admin/super-admin/coverage-actions";
import { errorTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

// Phase SAC.4 (#164): end an active coverage assignment.
export function CoverageEndForm({ assignmentId }: { assignmentId: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    superAdminEndCoverage,
    undefined
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "Ending…" : "End"}
      </PButton>
      {state && !state.ok ? (
        <p style={errorTextStyle}>{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}
