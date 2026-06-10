"use client";

import { useEffect } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminLogShepherdCareInteraction,
  adminUpsertShepherdCareProfile,
} from "@/app/(protected)/admin/shepherd-care/actions";
import { shepherdCareStatusLabel } from "@/lib/dashboard/labels";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { ShepherdCareProfilesRow } from "@/types/database";
import type {
  ShepherdCareInteractionType,
  ShepherdCareStatus,
} from "@/types/enums";

// Single-purpose care-action forms (#272, Admin Interaction Model req 10). The
// old detail stacked two dense forms — a "Log interaction" form with embedded
// "also update status / also set a follow-up" checkboxes, and an "Update care
// profile" form with a tick-to-change checkbox per field. This replaces them
// with plain, separate choices, each form doing exactly one thing. They reuse
// the existing server actions unchanged (no data-model or permission change):
// logging submits only an interaction; each profile edit submits exactly one
// sparse `set_*` flag.

const STATUSES: ShepherdCareStatus[] = [
  "doing_well",
  "needs_encouragement",
  "needs_follow_up",
  "concern",
  "inactive",
];

// Form anatomy (design direction §4): tracked-uppercase survives on form field
// labels only; inputs are full-width, line-bordered, surface-backed, with the
// global focus ring.
const FIELD_LABEL =
  "mb-1.5 block font-sans text-xs font-semibold uppercase tracking-wide text-ink3";
const FIELD_INPUT =
  "w-full rounded-sm border border-line bg-surface px-3 py-2.5 font-sans text-base leading-snug text-ink";
const FORM_NOTE = "m-0 mb-3 font-sans text-sm leading-normal text-ink2";

// Local calendar day, so the date picker pre-fills the caller's natural
// "today" without the one-day UTC drift `toISOString().slice(0,10)` causes west
// of UTC. The server validator accepts up to UTC today + 1, so a local-today
// cap never rejects anything it allows.
function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// The drawer wiring every care-action form shares (mirrors the care follow-up
// create form, #268): `onSaved` closes + refreshes, `onDirty` lets the drawer
// warn before discarding, `onPendingChange` blocks dismissal mid-write, and
// `onCancel` renders a Cancel control.
type DrawerFormProps = {
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
};

function CancelButton({
  onCancel,
  pending,
}: {
  onCancel?: () => void;
  pending: boolean;
}) {
  if (!onCancel) return null;
  return (
    <PButton
      type="button"
      tone="ghost"
      size="md"
      disabled={pending}
      onClick={onCancel}
    >
      Cancel
    </PButton>
  );
}

// Log a call / text / visit. The interaction type is fixed by which action the
// admin chose, so it's a hidden field — no type dropdown, no status/follow-up
// checkboxes. Status and next touchpoint are their own separate actions.
export function LogTouchForm({
  shepherdProfileId,
  interactionType,
  touchLabel,
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
}: {
  shepherdProfileId: string;
  interactionType: ShepherdCareInteractionType;
  // Lower-case noun for this touch, e.g. "call", "text", "visit".
  touchLabel: string;
} & DrawerFormProps) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminLogShepherdCareInteraction,
    { resetOnSuccess: true }
  );

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      className="grid gap-3"
    >
      <input
        type="hidden"
        name="shepherd_profile_id"
        value={shepherdProfileId}
      />
      <input type="hidden" name="interaction_type" value={interactionType} />
      <p className={FORM_NOTE}>
        Record a {touchLabel} with this leader. Admin-only — it never appears on
        leader or member surfaces.
      </p>
      <div>
        <label htmlFor="cta-interaction_at" className={FIELD_LABEL}>
          Date
        </label>
        <input
          id="cta-interaction_at"
          name="interaction_at"
          type="date"
          required
          defaultValue={todayLocalIso()}
          max={todayLocalIso()}
          className={FIELD_INPUT}
        />
      </div>
      <div>
        <label htmlFor="cta-notes" className={FIELD_LABEL}>
          What happened (optional, max 2000 chars) — admin-only
        </label>
        <textarea
          id="cta-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          className={`${FIELD_INPUT} min-h-20 resize-y`}
          placeholder="What did you talk about? What's the read?"
        />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : `Log ${touchLabel}`}
        </PButton>
        <CancelButton onCancel={onCancel} pending={pending} />
      </div>
      <FormStatus state={state} successText="Interaction logged." />
    </form>
  );
}

// One sparse profile edit at a time: Update status, Set next touchpoint, or
// Add/Edit summary. Each submits exactly one `set_*` flag against the existing
// upsert action.
export function CareProfileFieldForm({
  shepherdProfileId,
  field,
  current,
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
}: {
  shepherdProfileId: string;
  field: "status" | "touchpoint" | "summary";
  current: ShepherdCareProfilesRow | null;
} & DrawerFormProps) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminUpsertShepherdCareProfile,
    { resetOnSuccess: true }
  );

  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      className="grid gap-3"
    >
      <input
        type="hidden"
        name="shepherd_profile_id"
        value={shepherdProfileId}
      />

      {field === "status" ? (
        <>
          <input type="hidden" name="set_current_status" value="true" />
          <p className={FORM_NOTE}>
            How is this leader doing, from your pastoral view? Admin-only.
          </p>
          <div>
            <label htmlFor="cta-current_status" className={FIELD_LABEL}>
              Care status
            </label>
            <select
              id="cta-current_status"
              name="current_status"
              defaultValue={current?.current_status ?? "doing_well"}
              className={FIELD_INPUT}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {shepherdCareStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {field === "touchpoint" ? (
        <>
          <input type="hidden" name="set_next_touchpoint_due" value="true" />
          <p className={FORM_NOTE}>
            When should you next reach out to this leader? Admin-only.
          </p>
          <div>
            <label htmlFor="cta-next_touchpoint_due" className={FIELD_LABEL}>
              Next step
            </label>
            {/* Required: this drawer always submits set_next_touchpoint_due, so
                an empty save would clear the leader's scheduled touchpoint. The
                drawer's one job is to *set* a date — requiring it stops a blank
                save from silently wiping an existing touchpoint. */}
            <input
              id="cta-next_touchpoint_due"
              name="next_touchpoint_due"
              type="date"
              required
              defaultValue={current?.next_touchpoint_due ?? ""}
              className={FIELD_INPUT}
            />
          </div>
        </>
      ) : null}

      {field === "summary" ? (
        <>
          <input type="hidden" name="set_admin_summary" value="true" />
          <p className={FORM_NOTE}>
            A high-level read on how this leader is doing. Admin-only — it never
            appears on leader or member surfaces.
          </p>
          <div>
            <label htmlFor="cta-admin_summary" className={FIELD_LABEL}>
              Issue / current concern (max 2000 chars) — admin-only
            </label>
            <textarea
              id="cta-admin_summary"
              name="admin_summary"
              rows={4}
              maxLength={2000}
              defaultValue={current?.admin_summary ?? ""}
              className={`${FIELD_INPUT} min-h-24 resize-y`}
              placeholder="High-level read on how this leader is doing."
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <PButton type="submit" tone="solid" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </PButton>
        <CancelButton onCancel={onCancel} pending={pending} />
      </div>
      <FormStatus state={state} successText="Care profile updated." />
    </form>
  );
}
