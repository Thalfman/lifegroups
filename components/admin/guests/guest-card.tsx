"use client";

import { useState } from "react";
import { PBadge } from "@/components/pastoral/atoms";
import { adminUpdateGuestPipeline } from "@/app/(protected)/admin/guests/actions";
import {
  GUEST_PIPELINE_STAGES,
  type GuestDirectoryEntry,
} from "@/lib/supabase/guest-reads";
import { pipelineStageLabel } from "@/lib/dashboard/labels";
import { cn } from "@/lib/utils";
import {
  fieldInputClassName,
  fieldSelectClassName,
} from "@/components/admin/forms/field-styles";
import { FormField } from "@/components/admin/forms/form-field";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { formatIsoDate } from "@/lib/shared/date";
import type { GroupsRow, ProfilesRow } from "@/types/database";
import type { GuestPipelineStage } from "@/types/enums";
import { Button } from "@/components/ui/button";

const NOTES_PREVIEW_CHARS = 140;

export function GuestCard({
  guest,
  groupsById,
  ownersById,
  activeGroups,
  ownerProfiles,
  openFollowUpsCount,
  isSuperAdmin = false,
}: {
  guest: GuestDirectoryEntry;
  groupsById: Map<string, GroupsRow>;
  ownersById: Map<string, ProfilesRow>;
  activeGroups: GroupsRow[];
  ownerProfiles: ProfilesRow[];
  openFollowUpsCount: number;
  // SAD9: super-admin-only inline permanent delete of this guest.
  isSuperAdmin?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpdateGuestPipeline
  );

  const firstAttendedGroup = guest.first_attended_group_id
    ? groupsById.get(guest.first_attended_group_id)?.name
    : null;
  const assignedGroup = guest.assigned_group_id
    ? groupsById.get(guest.assigned_group_id)
    : null;
  const owner = guest.follow_up_owner_id
    ? ownersById.get(guest.follow_up_owner_id)
    : null;

  const notesPreview = guest.notes
    ? guest.notes.length > NOTES_PREVIEW_CHARS
      ? `${guest.notes.slice(0, NOTES_PREVIEW_CHARS).trim()}…`
      : guest.notes
    : null;

  const sortedActive = [...activeGroups].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedOwners = [...ownerProfiles].sort((a, b) =>
    a.full_name.localeCompare(b.full_name)
  );

  return (
    <article className="grid gap-3.5 rounded-lg border border-line bg-surface px-[22px] py-[18px]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[19px] font-medium tracking-[-0.3px] text-ink">
            {guest.full_name}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 font-mono text-xs text-ink2">
            <span>{guest.email ?? "—"}</span>
            <span>{guest.phone ?? "—"}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PBadge tone={badgeToneForStage(guest.pipeline_stage)}>
            {pipelineStageLabel(guest.pipeline_stage)}
          </PBadge>
          {openFollowUpsCount > 0 ? (
            <PBadge tone="followup">
              {openFollowUpsCount} open follow-up
              {openFollowUpsCount === 1 ? "" : "s"}
            </PBadge>
          ) : null}
        </div>
      </header>

      <dl className="lg-m-grid-stack m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-4 gap-y-2">
        <DetailRow
          label="First attended"
          value={
            firstAttendedGroup
              ? `${firstAttendedGroup}${
                  guest.first_attended_date
                    ? ` · ${guest.first_attended_date}`
                    : ""
                }`
              : (guest.first_attended_date ?? "—")
          }
        />
        <DetailRow label="Assigned group" value={assignedGroup?.name ?? "—"} />
        <DetailRow label="Follow-up owner" value={owner?.full_name ?? "—"} />
        {/* created_at is a timestamptz — slice to its UTC calendar day for the
            shared drift-proof date formatter. */}
        <DetailRow
          label="Added"
          value={formatIsoDate(guest.created_at.slice(0, 10))}
        />
      </dl>

      {notesPreview ? (
        <blockquote className="m-0 rounded-sm bg-surfaceAlt px-3.5 py-2.5 font-sans text-sm italic leading-normal text-ink">
          “{notesPreview}”
        </blockquote>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cancel" : "Update"}
        </Button>
        {isSuperAdmin ? (
          <SuperAdminInlineDelete
            entityType="guest"
            id={guest.id}
            label={guest.full_name}
          />
        ) : null}
      </div>

      {editing ? (
        <form
          action={formAction}
          className="grid gap-3 border-t border-lineSoft pt-3.5"
        >
          <input type="hidden" name="guest_id" value={guest.id} />
          <div className="lg-m-grid-stack grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            <FormField htmlFor={`stage-${guest.id}`} label="Pipeline stage">
              <select
                id={`stage-${guest.id}`}
                name="pipeline_stage"
                defaultValue={guest.pipeline_stage}
                className={fieldSelectClassName}
              >
                {GUEST_PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {pipelineStageLabel(s)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField htmlFor={`group-${guest.id}`} label="Assigned group">
              <input type="hidden" name="set_assigned_group_id" value="true" />
              <select
                id={`group-${guest.id}`}
                name="assigned_group_id"
                defaultValue={guest.assigned_group_id ?? ""}
                className={fieldSelectClassName}
              >
                <option value="">— (none)</option>
                {sortedActive.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField htmlFor={`owner-${guest.id}`} label="Follow-up owner">
              <input type="hidden" name="set_follow_up_owner_id" value="true" />
              <select
                id={`owner-${guest.id}`}
                name="follow_up_owner_id"
                defaultValue={guest.follow_up_owner_id ?? ""}
                className={fieldSelectClassName}
              >
                <option value="">— (none)</option>
                {sortedOwners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField
            htmlFor={`notes-${guest.id}`}
            label="Notes (max 1000 chars)"
          >
            <input type="hidden" name="set_notes" value="true" />
            <textarea
              id={`notes-${guest.id}`}
              name="notes"
              rows={3}
              maxLength={1000}
              defaultValue={guest.notes ?? ""}
              className={cn(fieldInputClassName, "min-h-[70px] resize-y")}
            />
          </FormField>
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" variant="solid" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Done
            </Button>
          </div>
          <FormStatus state={state} successText="Saved." />
        </form>
      ) : null}
    </article>
  );
}

function badgeToneForStage(stage: GuestPipelineStage) {
  switch (stage) {
    case "new":
    case "contacted":
      return "followup" as const;
    case "interested":
      return "watch" as const;
    case "assigned":
    case "attended":
    case "placed":
      return "healthy" as const;
    case "not_now":
      return "pause" as const;
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="mb-0.5 font-sans text-[10px] font-semibold uppercase tracking-[1.2px] text-ink3">
        {label}
      </dt>
      <dd className="m-0 font-sans text-sm text-ink">{value}</dd>
    </div>
  );
}
