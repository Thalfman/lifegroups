"use client";

import { PButton } from "@/components/pastoral/button";
import {
  superAdminBulkImportPeople,
  type BulkImportPeopleSuccess,
} from "@/app/(protected)/admin/super-admin/people-import-actions";
import { cn } from "@/lib/utils";
import {
  errorTextClassName,
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
  successTextClassName,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.5 (#165): paste CSV with a header row (full_name, email, phone,
// role). The pure module parses + de-dups; this form shows the created counts
// and any per-row parse errors that were skipped.
export function PeopleImportForm() {
  const { state, formAction, pending } = useActionForm<BulkImportPeopleSuccess>(
    superAdminBulkImportPeople
  );

  return (
    <form action={formAction} className="grid gap-2.5">
      <div>
        <label htmlFor="people-import-payload" className={fieldLabelClassName}>
          CSV
        </label>
        <textarea
          id="people-import-payload"
          name="payload"
          rows={8}
          placeholder={
            "full_name,email,phone,role\nJane Doe,jane@example.com,555-0100,leader\nJohn Smith,,,member"
          }
          className={cn(fieldInputClassName, "font-mono")}
        />
        <p className={fieldHintClassName}>
          Header row required. role must be leader or member; leaders need an
          email. Duplicate emails within the paste are de-duplicated.
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Importing…" : "Import people"}
        </PButton>
        {state?.ok ? (
          <span className={successTextClassName}>
            Imported {state.value.createdCount} ({state.value.leaderCount}{" "}
            leaders, {state.value.memberCount} members).
          </span>
        ) : null}
      </div>
      {state?.ok && state.value.perRowErrors.length > 0 ? (
        <div className="grid gap-1">
          <p className="m-0 font-sans text-xs text-ink2">
            {state.value.perRowErrors.length} row
            {state.value.perRowErrors.length === 1 ? "" : "s"} skipped:
          </p>
          <ul className="m-0 grid list-none gap-1 p-0">
            {state.value.perRowErrors.map((e, i) => (
              <li key={i}>
                <p className={errorTextClassName}>
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
