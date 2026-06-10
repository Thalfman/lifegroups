"use client";

// health-checks-reset: a per-entity "Reset attention" control (super-admin
// only) for a single leader (care) or group (health). A two-step confirm — no
// type-to-confirm phrase, since one row is light — then it calls the same reset
// action with scope='entity'. Setting a per-entity baseline drops just that row
// from the queue without muting or deleting history; it's recoverable from the
// Super Admin Console's reset card. The server action re-checks super-admin.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PButton } from "@/components/pastoral/button";
import {
  superAdminResetCareAttention,
  superAdminResetHealthAttention,
} from "@/app/(protected)/admin/super-admin/attention-reset-actions";
import type { AttentionResetSuccess } from "@/lib/admin/danger-zone";
import type { AttentionResetSurface } from "@/lib/admin/attention-reset";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";

const RESET_ACTION = {
  care: superAdminResetCareAttention,
  health: superAdminResetHealthAttention,
} as const;

export function AttentionResetEntityButton({
  surface,
  entityId,
  entityLabel,
}: {
  surface: AttentionResetSurface;
  // Shepherd profile id (care) or group id (health).
  entityId: string;
  // Used only in the confirm copy, e.g. the leader's or group's name.
  entityLabel?: string;
}) {
  const form = useActionForm<AttentionResetSuccess>(RESET_ACTION[surface]);
  const [armed, setArmed] = useState(false);
  const done = form.state?.ok === true;
  const clockLabel = surface === "care" ? "care" : "health-check";
  const who = entityLabel ? `${entityLabel}'s` : "this";

  if (done) {
    return (
      <span className="font-sans text-xs text-ink2">
        Reset — cleared from the queue. Undo from Super Admin → Danger Zone.
      </span>
    );
  }

  if (!armed) {
    return (
      <PButton
        type="button"
        tone="ghost"
        size="sm"
        onClick={() => setArmed(true)}
      >
        Reset attention
      </PButton>
    );
  }

  return (
    <form
      action={form.formAction}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="scope" value="entity" />
      <input type="hidden" name="entityId" value={entityId} />
      <span className="font-sans text-sm text-ink">
        Reset {who} {clockLabel} clock? It re-surfaces naturally later.
      </span>
      <Button
        type="submit"
        variant="destructive"
        size="sm"
        disabled={form.pending}
      >
        {form.pending ? "Resetting…" : "Confirm reset"}
      </Button>
      <PButton
        type="button"
        tone="ghost"
        size="sm"
        onClick={() => setArmed(false)}
        disabled={form.pending}
      >
        Cancel
      </PButton>
      <FormStatus state={form.state} />
    </form>
  );
}
