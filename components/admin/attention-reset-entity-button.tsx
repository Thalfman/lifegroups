"use client";

// health-checks-reset: a per-entity "Reset attention" control (super-admin
// only) for a single leader (care) or group (health). A two-step confirm — no
// type-to-confirm phrase, since one row is light — then it calls the same reset
// action with scope='entity'. Setting a per-entity baseline drops just that row
// from the queue without muting or deleting history; it's recoverable from the
// Super Admin Console's reset card. The server action re-checks super-admin.

import { useState } from "react";
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
import { P, fontBody } from "@/lib/pastoral";

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
      <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2 }}>
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
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <input type="hidden" name="scope" value="entity" />
      <input type="hidden" name="entityId" value={entityId} />
      <span style={{ fontFamily: fontBody, fontSize: 12.5, color: P.ink }}>
        Reset {who} {clockLabel} clock? It re-surfaces naturally later.
      </span>
      <PButton type="submit" tone="terra" size="sm" disabled={form.pending}>
        {form.pending ? "Resetting…" : "Confirm reset"}
      </PButton>
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
