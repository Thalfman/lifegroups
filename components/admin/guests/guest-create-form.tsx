"use client";

import { adminCreateGuest } from "@/app/(protected)/admin/guests/actions";
import { cn } from "@/lib/utils";
import {
  fieldInputClassName,
  fieldSelectClassName,
  formGridClassName,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";
import { FormField } from "@/components/admin/forms/form-field";
import { GUEST_PIPELINE_STAGES } from "@/lib/supabase/guest-reads";
import { pipelineStageLabel } from "@/lib/dashboard/labels";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { GroupsRow, ProfilesRow } from "@/types/database";
import { Button } from "@/components/ui/button";

export function GuestCreateForm({
  activeGroups,
  historicalGroups,
  ownerProfiles,
}: {
  activeGroups: GroupsRow[];
  historicalGroups: GroupsRow[];
  ownerProfiles: ProfilesRow[];
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateGuest,
    { resetOnSuccess: true }
  );

  const sortedActive = [...activeGroups].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedHistorical = [...historicalGroups].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedOwners = [...ownerProfiles].sort((a, b) =>
    a.full_name.localeCompare(b.full_name)
  );

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <p className={formNoteClassName}>
        Only the full name is required. Everything else is optional and can be
        filled in as the conversation unfolds.
      </p>
      <div className={formGridClassName}>
        <FormField htmlFor="guest-full_name" label="Full name">
          <input
            id="guest-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="Avery Bennett"
          />
        </FormField>
        <FormField htmlFor="guest-email" label="Email (optional)">
          <input
            id="guest-email"
            name="email"
            type="email"
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="avery@example.com"
          />
        </FormField>
        <FormField htmlFor="guest-phone" label="Phone (optional)">
          <input
            id="guest-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            className={fieldInputClassName}
            placeholder="(555) 555-0100"
          />
        </FormField>
        <FormField htmlFor="guest-pipeline_stage" label="Pipeline stage">
          <select
            id="guest-pipeline_stage"
            name="pipeline_stage"
            defaultValue="new"
            className={fieldSelectClassName}
          >
            {GUEST_PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {pipelineStageLabel(s)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          htmlFor="guest-first_attended_group_id"
          label="First attended group (optional)"
        >
          <select
            id="guest-first_attended_group_id"
            name="first_attended_group_id"
            defaultValue=""
            className={fieldSelectClassName}
          >
            <option value="">—</option>
            {sortedHistorical.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.lifecycle_status === "closed" ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          htmlFor="guest-first_attended_date"
          label="First attended date (optional)"
        >
          <input
            id="guest-first_attended_date"
            name="first_attended_date"
            type="date"
            className={fieldInputClassName}
          />
        </FormField>
        <FormField
          htmlFor="guest-assigned_group_id"
          label="Assigned group (optional)"
        >
          <select
            id="guest-assigned_group_id"
            name="assigned_group_id"
            defaultValue=""
            className={fieldSelectClassName}
          >
            <option value="">—</option>
            {sortedActive.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          htmlFor="guest-follow_up_owner_id"
          label="Follow-up owner (optional)"
        >
          <select
            id="guest-follow_up_owner_id"
            name="follow_up_owner_id"
            defaultValue=""
            className={fieldSelectClassName}
          >
            <option value="">—</option>
            {sortedOwners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField
          htmlFor="guest-notes"
          label="Notes (optional, max 1000 chars)"
          className="md:col-span-full"
        >
          <textarea
            id="guest-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            className={cn(fieldInputClassName, "min-h-20 resize-y")}
            placeholder="How they heard about us, who they came with, anything worth remembering."
          />
        </FormField>
        <div>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add guest"}
          </Button>
        </div>
      </div>
      <FormStatus state={state} successText="Guest added." />
    </form>
  );
}
