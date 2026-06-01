"use client";

import { PButton } from "@/components/pastoral/button";
import { adminCreateGuest } from "@/app/(protected)/admin/guests/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
} from "@/components/admin/forms/field-styles";
import { GUEST_PIPELINE_STAGES } from "@/lib/supabase/read-models";
import { pipelineStageLabel } from "@/lib/dashboard/labels";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { GroupsRow, ProfilesRow } from "@/types/database";

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
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
      <p style={formNoteStyle}>
        Only the full name is required. Everything else is optional and can be
        filled in as the conversation unfolds.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="guest-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="guest-full_name"
            name="full_name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Avery Bennett"
          />
        </div>
        <div>
          <label htmlFor="guest-email" style={fieldLabelStyle}>
            Email (optional)
          </label>
          <input
            id="guest-email"
            name="email"
            type="email"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="avery@example.com"
          />
        </div>
        <div>
          <label htmlFor="guest-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="guest-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="(555) 555-0100"
          />
        </div>
        <div>
          <label htmlFor="guest-pipeline_stage" style={fieldLabelStyle}>
            Pipeline stage
          </label>
          <select
            id="guest-pipeline_stage"
            name="pipeline_stage"
            defaultValue="new"
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
          <label
            htmlFor="guest-first_attended_group_id"
            style={fieldLabelStyle}
          >
            First attended group (optional)
          </label>
          <select
            id="guest-first_attended_group_id"
            name="first_attended_group_id"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">—</option>
            {sortedHistorical.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.lifecycle_status === "closed" ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="guest-first_attended_date" style={fieldLabelStyle}>
            First attended date (optional)
          </label>
          <input
            id="guest-first_attended_date"
            name="first_attended_date"
            type="date"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="guest-assigned_group_id" style={fieldLabelStyle}>
            Assigned group (optional)
          </label>
          <select
            id="guest-assigned_group_id"
            name="assigned_group_id"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">—</option>
            {sortedActive.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="guest-follow_up_owner_id" style={fieldLabelStyle}>
            Follow-up owner (optional)
          </label>
          <select
            id="guest-follow_up_owner_id"
            name="follow_up_owner_id"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">—</option>
            {sortedOwners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="guest-notes" style={fieldLabelStyle}>
            Notes (optional, max 1000 chars)
          </label>
          <textarea
            id="guest-notes"
            name="notes"
            rows={3}
            maxLength={1000}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="How they heard about us, who they came with, anything worth remembering."
          />
        </div>
        <div>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add guest"}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText="Guest added." />
    </form>
  );
}
