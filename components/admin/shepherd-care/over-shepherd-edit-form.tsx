"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminUpdateOverShepherd } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  formNoteStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import { P, fontBody } from "@/lib/pastoral";
import type { ActionResult } from "@/lib/admin/action-result";
import type { OverShepherdsRow } from "@/types/database";

type State = ActionResult<{ id: string }> | undefined;

export function OverShepherdEditForm({
  overShepherd,
}: {
  overShepherd: OverShepherdsRow;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateOverShepherd,
    undefined,
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <input
        type="hidden"
        name="over_shepherd_id"
        value={overShepherd.id}
      />
      <p style={formNoteStyle}>
        Update the over-shepherd record. Deactivating archives them
        softly — they remain in the audit trail and historic coverage
        assignments. Reactivate any time.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="os-edit-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="os-edit-full_name"
            name="full_name"
            type="text"
            required
            maxLength={200}
            defaultValue={overShepherd.full_name}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="os-edit-email" style={fieldLabelStyle}>
            Email (optional)
          </label>
          <input
            id="os-edit-email"
            name="email"
            type="email"
            defaultValue={overShepherd.email ?? ""}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="os-edit-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="os-edit-phone"
            name="phone"
            type="tel"
            defaultValue={overShepherd.phone ?? ""}
            style={fieldInputStyle}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="os-edit-notes" style={fieldLabelStyle}>
            Notes (optional, max 2000 chars) — admin-only
          </label>
          <textarea
            id="os-edit-notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={overShepherd.notes ?? ""}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
            }}
          >
            <input
              type="checkbox"
              name="active"
              value="true"
              defaultChecked={overShepherd.active}
            />
            Active (uncheck to soft-archive)
          </label>
        </div>
        <div>
          <PButton type="submit" tone="solid" size="md" disabled={pending}>
            {pending ? "Saving…" : "Save over-shepherd"}
          </PButton>
        </div>
      </div>
      {state && !state.ok ? (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
          {state.errors.map((err, i) => (
            <li key={i}>
              <p style={errorTextStyle}>{err}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {state?.ok ? <p style={successTextStyle}>Over-shepherd saved.</p> : null}
    </form>
  );
}
