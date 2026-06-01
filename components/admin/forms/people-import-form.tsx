"use client";

import { PButton } from "@/components/pastoral/button";
import {
  superAdminBulkImportPeople,
  type BulkImportPeopleSuccess,
} from "@/app/(protected)/admin/super-admin/people-import-actions";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formNoteStyle,
  successTextStyle,
} from "./field-styles";
import { P, fontBody } from "@/lib/pastoral";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.5 (#165): paste CSV with a header row (full_name, email, phone,
// role). The pure module parses + de-dups; this form shows the created counts
// and any per-row parse errors that were skipped.
export function PeopleImportForm() {
  const { state, formAction, pending } = useActionForm<BulkImportPeopleSuccess>(
    superAdminBulkImportPeople
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 10 }}>
      <div>
        <label htmlFor="people-import-payload" style={fieldLabelStyle}>
          CSV
        </label>
        <textarea
          id="people-import-payload"
          name="payload"
          rows={8}
          placeholder={
            "full_name,email,phone,role\nJane Doe,jane@example.com,555-0100,leader\nJohn Smith,,,member"
          }
          style={{ ...fieldInputStyle, fontFamily: "var(--font-mono)" }}
        />
        <p style={formNoteStyle}>
          Header row required. role must be leader or member; leaders need an
          email. Duplicate emails within the paste are de-duplicated.
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Importing…" : "Import people"}
        </PButton>
        {state?.ok ? (
          <span style={successTextStyle}>
            Imported {state.value.createdCount} ({state.value.leaderCount}{" "}
            leaders, {state.value.memberCount} members).
          </span>
        ) : null}
      </div>
      {state?.ok && state.value.perRowErrors.length > 0 ? (
        <div style={{ display: "grid", gap: 4 }}>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
              margin: 0,
            }}
          >
            {state.value.perRowErrors.length} row
            {state.value.perRowErrors.length === 1 ? "" : "s"} skipped:
          </p>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: 4,
            }}
          >
            {state.value.perRowErrors.map((e, i) => (
              <li key={i}>
                <p style={errorTextStyle}>
                  Line {e.line}: {e.errors.join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <FormStatus state={state} />
    </form>
  );
}
