"use client";

import { PButton } from "@/components/pastoral/button";
import { superAdminSetFeatureFlag } from "@/app/(protected)/admin/super-admin/feature-flag-actions";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.2 (#161): toggle a single feature flag. The hidden `enabled` field
// is the flipped value, so the server action only ever sets `enabled` (never
// `verified`).
export function FeatureFlagToggleForm({
  flagKey,
  enabled,
}: {
  flagKey: string;
  enabled: boolean;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    superAdminSetFeatureFlag
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="key" value={flagKey} />
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <PButton type="submit" tone="terra" size="sm" disabled={pending}>
        {pending ? "Saving…" : enabled ? "Turn off" : "Turn on"}
      </PButton>
      <FormStatus state={state} successText="Saved." />
    </form>
  );
}
