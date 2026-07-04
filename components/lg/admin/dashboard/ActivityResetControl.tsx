"use client";

// activity-reset: the Super-Admin-only control beside the Home "Recent activity"
// header. It sets a global "as-of" baseline so every activity tile drops to zero
// WITHOUT deleting any domain rows — a fresh start that climbs again naturally —
// and offers Undo (clear the baseline → back to all-time counts). The reset is a
// two-step click-confirm (it changes what the band shows for the whole admin
// team); the server action is hard-gated to super_admin regardless.

import { useState } from "react";
import { useValueChange } from "@/lib/hooks/use-value-change";
import {
  superAdminResetActivity,
  superAdminClearActivityReset,
} from "@/app/(protected)/admin/super-admin/activity-reset-actions";
import type { ActivityResetSuccess } from "@/lib/admin/danger-zone";
import { Button } from "@/components/ui/button";
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
              <Button type="submit" variant="primary" size="sm" disabled={busy}>
                {reset.pending ? "Resetting…" : "Confirm reset"}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={busy}
            >
              Reset
            </Button>
            {baselineOn ? (
              <form action={clear.formAction}>
                <Button type="submit" variant="ghost" size="sm" disabled={busy}>
                  {clear.pending ? "Undoing…" : "Undo reset"}
                </Button>
              </form>
            ) : null}
          </>
        )}
      </div>

      <FormStatus
        state={reset.state}
        successText="Recent activity reset. The tiles will climb again from today."
      />
      <FormStatus
        state={clear.state}
        successText="Reset cleared. The tiles show all-time counts again."
      />
    </div>
  );
}
