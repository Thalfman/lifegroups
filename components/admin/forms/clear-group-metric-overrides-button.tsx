"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpsertGroupMetricSettings } from "@/app/(protected)/admin/settings/actions";
import { errorTextStyle } from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

// Clears every override field on a group_metric_settings row by calling
// the upsert RPC with all nulls. The row stays in the table (no hard
// delete) but every helper that consults it -- hasActiveOverrides,
// effectiveCapacity, effectiveHealthStatus -- will see "no override".
export function ClearGroupMetricOverridesButton({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpsertGroupMetricSettings,
    undefined,
  );

  function confirm(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Clear all metric overrides on ${groupName}? It'll fall back to the global defaults.`,
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
      <form action={formAction} onSubmit={confirm}>
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="capacity_override" value="" />
        <input
          type="hidden"
          name="capacity_warning_threshold_pct_override"
          value=""
        />
        <input type="hidden" name="healthy_attendance_pct_override" value="" />
        <input type="hidden" name="manual_health_status_override" value="none" />
        {/* exclude_from_capacity_metrics is intentionally NOT submitted so the
            server action reads it as `false` (browsers omit unchecked
            checkboxes). admin_metric_notes is omitted -> "" -> null. */}
        <input type="hidden" name="admin_metric_notes" value="" />
        <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
          {pending ? "Clearing…" : "Clear overrides"}
        </PButton>
      </form>
      {state && !state.ok ? <p style={errorTextStyle}>{state.errors[0]}</p> : null}
    </div>
  );
}
