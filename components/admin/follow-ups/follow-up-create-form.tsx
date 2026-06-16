"use client";

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateFollowUp } from "@/app/(protected)/admin/follow-ups/actions";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import type { GroupsRow, MembersRow, ProfilesRow } from "@/types/database";
import type { FollowUpPriority, FollowUpType } from "@/types/enums";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  fieldLabelClassName as FIELD_LABEL,
  fieldInputBaseClassName as FIELD_INPUT,
  fieldHintClassName as FIELD_HINT,
} from "@/components/admin/forms/field-styles";

const TYPES: FollowUpType[] = [
  "attendance",
  "guest",
  "leader",
  "capacity",
  "pause",
  "care",
  "admin",
];

const PRIORITIES: FollowUpPriority[] = ["low", "normal", "high"];

export function FollowUpCreateForm({
  groups,
  members,
  assignees,
  // Supplied when rendered inside the EditingSurface drawer (#267), mirroring
  // the Groups create flow (#266): `onSaved` closes + refreshes once the
  // follow-up is created, `onDirty` lets the drawer warn before discarding
  // entered values, `onCancel` renders a Cancel control beside Add follow-up,
  // and `onPendingChange` lets the drawer block dismissal while the create is
  // in flight.
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
}: {
  groups: GroupsRow[];
  members: MembersRow[];
  assignees: ProfilesRow[];
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateFollowUp,
    { resetOnSuccess: true }
  );

  // useActionForm resets the <form> on success; in the drawer `onSaved` then
  // closes it (the form unmounts, so the reset is moot there but harmless).
  useEffect(() => {
    if (state?.ok) onSaved?.();
  }, [state, onSaved]);

  // Mirror the in-flight state up so the drawer keeps itself open until the
  // create resolves rather than being dismissed mid-write.
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const sortedMembers = [...members].sort((a, b) =>
    a.full_name.localeCompare(b.full_name)
  );

  // Gate the submit on the one required field (Title), mirroring New Group /
  // Add Prospect, with a short inline hint until it's filled in.
  const [title, setTitle] = useState("");
  const canSubmit = title.trim().length > 0;

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      className="grid gap-3"
    >
      <p className="mb-3 mt-0 font-sans text-sm text-ink2">
        Title and type are required. Relate it to whichever entity makes sense —
        group or member — and assign someone if you want them to own it. Notes
        are optional and capped at 1000 characters each.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:items-end md:gap-3.5">
        <div>
          <label htmlFor="fu-title" className={FIELD_LABEL}>
            Title
          </label>
          <input
            id="fu-title"
            name="title"
            type="text"
            required
            maxLength={200}
            className={FIELD_INPUT}
            placeholder="Reach out to Skyler about placement"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="fu-type" className={FIELD_LABEL}>
            Type
          </label>
          <select
            id="fu-type"
            name="type"
            required
            defaultValue="admin"
            className={FIELD_INPUT}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {followUpTypeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-priority" className={FIELD_LABEL}>
            Priority
          </label>
          <select
            id="fu-priority"
            name="priority"
            defaultValue="normal"
            className={FIELD_INPUT}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {followUpPriorityLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-due_date" className={FIELD_LABEL}>
            Due date (optional)
          </label>
          <input
            id="fu-due_date"
            name="due_date"
            type="date"
            className={FIELD_INPUT}
          />
        </div>
        <div>
          <label htmlFor="fu-related_group_id" className={FIELD_LABEL}>
            Related group (optional)
          </label>
          <select
            id="fu-related_group_id"
            name="related_group_id"
            defaultValue=""
            className={FIELD_INPUT}
          >
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.lifecycle_status === "closed" ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-related_member_id" className={FIELD_LABEL}>
            Related member (optional)
          </label>
          <select
            id="fu-related_member_id"
            name="related_member_id"
            defaultValue=""
            className={FIELD_INPUT}
          >
            <option value="">—</option>
            {sortedMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fu-assigned_to" className={FIELD_LABEL}>
            Assigned to (optional)
          </label>
          <select
            id="fu-assigned_to"
            name="assigned_to"
            defaultValue=""
            className={FIELD_INPUT}
          >
            <option value="">— (unassigned)</option>
            {assignees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-full">
          <label htmlFor="fu-leader_visible_note" className={FIELD_LABEL}>
            Leader-visible note (optional, max 1000 chars)
          </label>
          <textarea
            id="fu-leader_visible_note"
            name="leader_visible_note"
            rows={2}
            maxLength={1000}
            className={`${FIELD_INPUT} min-h-[60px] resize-y`}
            placeholder="Anything the assigned leader should see when they open this."
          />
        </div>
        <div className="col-span-full">
          <label htmlFor="fu-admin_private_note" className={FIELD_LABEL}>
            Admin-private note (optional, max 1000 chars) — leaders never see
            this
          </label>
          <textarea
            id="fu-admin_private_note"
            name="admin_private_note"
            rows={2}
            maxLength={1000}
            className={`${FIELD_INPUT} min-h-[60px] resize-y`}
            placeholder="Context only the admin team should see."
          />
        </div>
        <div className="col-span-full flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2.5">
            <PButton
              type="submit"
              tone="terra"
              size="md"
              disabled={pending || !canSubmit}
            >
              {pending ? "Saving…" : "Add follow-up"}
            </PButton>
            {onCancel ? (
              <PButton
                type="button"
                tone="ghost"
                size="md"
                disabled={pending}
                onClick={onCancel}
              >
                Cancel
              </PButton>
            ) : null}
          </div>
          {!canSubmit ? (
            <p className={FIELD_HINT}>Enter a title to enable Add follow-up.</p>
          ) : null}
        </div>
      </div>
      <FormStatus state={state} successText="Follow-up created." />
    </form>
  );
}
