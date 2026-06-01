"use client";

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { PBadge } from "@/components/pastoral/atoms";
import { adminUpdateGuestPipeline } from "@/app/(protected)/admin/guests/actions";
import {
  GUEST_PIPELINE_STAGES,
  type GuestDirectoryEntry,
} from "@/lib/supabase/read-models";
import { pipelineStageLabel } from "@/lib/dashboard/labels";
import { P, fontBody, fontDisplay, fontMono, fontSans } from "@/lib/pastoral";
import {
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { GroupsRow, ProfilesRow } from "@/types/database";
import type { GuestPipelineStage } from "@/types/enums";

const NOTES_PREVIEW_CHARS = 140;

export function GuestCard({
  guest,
  groupsById,
  ownersById,
  activeGroups,
  ownerProfiles,
  openFollowUpsCount,
}: {
  guest: GuestDirectoryEntry;
  groupsById: Map<string, GroupsRow>;
  ownersById: Map<string, ProfilesRow>;
  activeGroups: GroupsRow[];
  ownerProfiles: ProfilesRow[];
  openFollowUpsCount: number;
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
    <article
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "18px 22px",
        display: "grid",
        gap: 14,
      }}
    >
      <header
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 19,
              fontWeight: 500,
              color: P.ink,
              letterSpacing: -0.3,
            }}
          >
            {guest.full_name}
          </div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 12,
              color: P.ink2,
              marginTop: 4,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>{guest.email ?? "—"}</span>
            <span>{guest.phone ?? "—"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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

      <dl
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "8px 16px",
          margin: 0,
        }}
      >
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
        <DetailRow label="Added" value={formatDate(guest.created_at)} />
      </dl>

      {notesPreview ? (
        <blockquote
          style={{
            background: P.bg,
            borderLeft: `3px solid ${P.terra}`,
            borderRadius: 10,
            padding: "10px 14px",
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            fontStyle: "italic",
            color: P.ink,
            lineHeight: 1.5,
          }}
        >
          “{notesPreview}”
        </blockquote>
      ) : null}

      <div>
        <PButton
          type="button"
          tone="ghost"
          size="sm"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cancel" : "Update"}
        </PButton>
      </div>

      {editing ? (
        <form
          action={formAction}
          style={{
            display: "grid",
            gap: 12,
            borderTop: `1px solid ${P.line2}`,
            paddingTop: 14,
          }}
        >
          <input type="hidden" name="guest_id" value={guest.id} />
          <div
            className="lg-m-grid-stack"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <div>
              <label htmlFor={`stage-${guest.id}`} style={fieldLabelStyle}>
                Pipeline stage
              </label>
              <select
                id={`stage-${guest.id}`}
                name="pipeline_stage"
                defaultValue={guest.pipeline_stage}
                style={fieldSelectStyle}
              >
                {GUEST_PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {pipelineStageLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`group-${guest.id}`} style={fieldLabelStyle}>
                Assigned group
              </label>
              <input type="hidden" name="set_assigned_group_id" value="true" />
              <select
                id={`group-${guest.id}`}
                name="assigned_group_id"
                defaultValue={guest.assigned_group_id ?? ""}
                style={fieldSelectStyle}
              >
                <option value="">— (none)</option>
                {sortedActive.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`owner-${guest.id}`} style={fieldLabelStyle}>
                Follow-up owner
              </label>
              <input type="hidden" name="set_follow_up_owner_id" value="true" />
              <select
                id={`owner-${guest.id}`}
                name="follow_up_owner_id"
                defaultValue={guest.follow_up_owner_id ?? ""}
                style={fieldSelectStyle}
              >
                <option value="">— (none)</option>
                {sortedOwners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={`notes-${guest.id}`} style={fieldLabelStyle}>
              Notes (max 1000 chars)
            </label>
            <input type="hidden" name="set_notes" value="true" />
            <textarea
              id={`notes-${guest.id}`}
              name="notes"
              rows={3}
              maxLength={1000}
              defaultValue={guest.notes ?? ""}
              style={{ ...fieldInputStyle, resize: "vertical", minHeight: 70 }}
            />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <PButton type="submit" tone="solid" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </PButton>
            <PButton
              type="button"
              tone="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Done
            </PButton>
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
      <dt
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink,
          margin: 0,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
