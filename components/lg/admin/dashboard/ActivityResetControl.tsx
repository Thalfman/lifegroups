"use client";

// activity-reset: the Super-Admin-only control beside the Home "Recent activity"
// header. It sets a global "as-of" baseline so every activity tile drops to zero
// WITHOUT deleting any domain rows — a fresh start that climbs again naturally —
// and offers Undo (clear the baseline → back to all-time counts). The reset is a
// two-step click-confirm (it changes what the band shows for the whole admin
// team); the server action is hard-gated to super_admin regardless.

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import {
  superAdminResetActivity,
  superAdminClearActivityReset,
} from "@/app/(protected)/admin/super-admin/activity-reset-actions";
import type { ActivityResetSuccess } from "@/lib/admin/danger-zone";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";

export function ActivityResetControl({
  baselineOn,
}: {
  baselineOn: string | null;
}) {
  const reset = useActionForm<ActivityResetSuccess>(superAdminResetActivity);
  const clear = useActionForm<ActivityResetSuccess>(
    superAdminClearActivityReset
  );
  const [confirming, setConfirming] = useState(false);

  // Collapse the confirm affordance once the reset lands, rather than unmounting
  // the submitting form mid-action (the page revalidates and re-renders with the
  // new baseline). Mirrors the attention-reset card's revert-on-success effect.
  const resetOk = reset.state?.ok;
  useValueChange(resetOk, (ok) => {
    if (ok) setConfirming(false);
  });

  const busy = reset.pending || clear.pending;

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="inline-flex flex-wrap items-center justify-end gap-2">
        {baselineOn ? (
          <span className="font-sans text-xs text-ink3">
            Reset {baselineOn} · counts climb from the next day
          </span>
        ) : null}

        {confirming ? (
          <>
            <span className="font-sans text-xs text-ink2">
              Reset counts to zero?
            </span>
            <form action={reset.formAction}>
              <PButton type="submit" tone="terra" size="sm" disabled={busy}>
                {reset.pending ? "Resetting…" : "Confirm reset"}
              </PButton>
            </form>
            <PButton
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </PButton>
          </>
        ) : (
          <>
            <PButton
              type="button"
              tone="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              Reset
            </PButton>
            {baselineOn ? (
              <form action={clear.formAction}>
                <PButton type="submit" tone="ghost" size="sm" disabled={busy}>
                  {clear.pending ? "Undoing…" : "Undo reset"}
                </PButton>
              </form>
            ) : null}
          </>
        )}
      </div>

      <FormStatus
        state={reset.state}
        successText="Recent activity reset — the tiles will climb again from today."
      />
      <FormStatus
        state={clear.state}
        successText="Reset cleared — the tiles show all-time counts again."
      />
    </div>
  );
}
