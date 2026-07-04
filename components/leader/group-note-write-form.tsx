"use client";

import {
  leaderWriteGroupCareNote,
  leaderWriteGroupPrayerRequest,
} from "@/app/(protected)/leader/[groupId]/care/actions";
import {
  fieldInputClassName,
  fieldLabelClassName,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Pivot slice 11 (#382 / ADR 0020). Writes one author-private Care Note OR
// Prayer Request about the leader's GROUP. The author is the signed-in leader;
// the leader-of-group boundary is enforced in the SECURITY DEFINER RPC. The body
// is sealed to the leader by default — ministry leadership reads it only when
// that leader's transparency toggle (set by an admin in the Care surface) is on.
export function GroupNoteWriteForm({
  groupId,
  kind,
}: {
  groupId: string;
  kind: "care_note" | "prayer_request";
}) {
  const action =
    kind === "care_note"
      ? leaderWriteGroupCareNote
      : leaderWriteGroupPrayerRequest;
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    action,
    { resetOnSuccess: true }
  );

  const label = kind === "care_note" ? "Care note" : "Prayer request";
  const idPrefix = kind === "care_note" ? "gcn" : "gpr";
  const placeholder =
    kind === "care_note"
      ? "What's going on with your group pastorally?"
      : "How can we be praying for your group?";

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <input type="hidden" name="group_id" value={groupId} />
      <p className={formNoteClassName}>
        {label}s are private to you. The only way ministry leadership can read
        them is if an admin turns on transparency for you &mdash; that&apos;s
        their call, not something you set here.
      </p>
      <div>
        <label htmlFor={`${idPrefix}-body`} className={fieldLabelClassName}>
          {label} (max 4000 chars)
        </label>
        <textarea
          id={`${idPrefix}-body`}
          name="body"
          rows={4}
          required
          maxLength={4000}
          className={cn(fieldInputClassName, "min-h-24 resize-y")}
          placeholder={placeholder}
        />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : `Add ${label.toLowerCase()}`}
        </Button>
      </div>
      <FormStatus state={state} successText={`${label} saved.`} />
    </form>
  );
}
