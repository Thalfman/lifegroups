"use client";

import { PButton } from "@/components/pastoral/button";
import { adminUpsertShepherdCareProfile } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
} from "@/components/admin/forms/field-styles";
import { shepherdCareStatusLabel } from "@/lib/dashboard/labels";
import { P, fontBody } from "@/lib/pastoral";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { ShepherdCareProfilesRow } from "@/types/database";
import type { ShepherdCareStatus } from "@/types/enums";

const STATUSES: ShepherdCareStatus[] = [
  "doing_well",
  "needs_encouragement",
  "needs_follow_up",
  "concern",
  "inactive",
];

export function UpdateCareProfileForm({
  shepherdProfileId,
  current,
}: {
  shepherdProfileId: string;
  current: ShepherdCareProfilesRow | null;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminUpsertShepherdCareProfile
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <input
        type="hidden"
        name="shepherd_profile_id"
        value={shepherdProfileId}
      />
      <p style={formNoteStyle}>
        Edit the care state without logging an interaction. Tick the matching
        checkbox for any field you want to change — unticked fields are left
        as-is.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="ucp-current_status" style={fieldLabelStyle}>
            Care status
          </label>
          <select
            id="ucp-current_status"
            name="current_status"
            defaultValue={current?.current_status ?? "doing_well"}
            style={fieldSelectStyle}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {shepherdCareStatusLabel(s)}
              </option>
            ))}
          </select>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
            }}
          >
            <input type="checkbox" name="set_current_status" value="true" />
            Update care status
          </label>
        </div>
        <div>
          <label htmlFor="ucp-next_touchpoint_due" style={fieldLabelStyle}>
            Next touchpoint
          </label>
          <input
            id="ucp-next_touchpoint_due"
            name="next_touchpoint_due"
            type="date"
            defaultValue={current?.next_touchpoint_due ?? ""}
            style={fieldInputStyle}
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
            }}
          >
            <input
              type="checkbox"
              name="set_next_touchpoint_due"
              value="true"
            />
            Update next touchpoint
          </label>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="ucp-admin_summary" style={fieldLabelStyle}>
            Admin summary (max 2000 chars) — admin-only
          </label>
          <textarea
            id="ucp-admin_summary"
            name="admin_summary"
            rows={3}
            maxLength={2000}
            defaultValue={current?.admin_summary ?? ""}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="High-level read on how this leader is doing."
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 6,
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
            }}
          >
            <input type="checkbox" name="set_admin_summary" value="true" />
            Update summary
          </label>
        </div>
        <div>
          <PButton type="submit" tone="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </PButton>
        </div>
      </div>
      <FormStatus state={state} successText="Care profile updated." />
    </form>
  );
}
