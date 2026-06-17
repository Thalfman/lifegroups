"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminBulkImportPeople,
  type BulkImportPeopleSuccess,
} from "@/app/(protected)/admin/settings/people-import-actions";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  errorTextClassName,
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
  successTextClassName,
} from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.5 (#165): import people from a CSV with a header row (full_name,
// email, phone, role). The pure module parses + de-dups; this form shows the
// created counts and any per-row parse errors that were skipped.
//
// Two equally-supported ways in (the textarea is the single submitted field, so
// upload simply fills it): upload a .csv file — read client-side via FileReader
// and dropped into the textarea so the operator can eyeball/edit before
// importing — OR paste straight in. A "Download CSV template" link gives the
// exact header to fill. Used by both Settings > System and the Super Admin
// Console; the action is admin-gated.
export function PeopleImportForm() {
  // resetOnSuccess clears the form after a successful import: the textarea +
  // file input are uncontrolled, so the native form reset empties both. Members
  // aren't de-duplicated across separate imports, so clearing the last batch
  // avoids an accidental duplicate re-submit; the success counts live on
  // `state`, so they stay visible after the fields clear.
  const { state, formAction, pending, formRef } =
    useActionForm<BulkImportPeopleSuccess>(adminBulkImportPeople, {
      resetOnSuccess: true,
    });
  const [fileError, setFileError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileId = useId();
  const payloadId = useId();

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setFileError("That file could not be read.");
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      // Drop the file's contents into the (uncontrolled) textarea so the
      // operator can eyeball/edit before importing; it's the single submitted
      // field, so upload and paste share one code path.
      if (textareaRef.current) textareaRef.current.value = text;
    };
    reader.readAsText(file);
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-2.5">
      <div className="grid gap-1.5">
        <label htmlFor={fileId} className={fieldLabelClassName}>
          Upload a CSV file
        </label>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
            className="font-sans text-sm text-ink2 file:mr-3 file:cursor-pointer file:rounded-pill file:border file:border-line file:bg-surface file:px-3.5 file:py-1.5 file:font-sans file:text-sm file:font-medium file:text-ink"
          />
          <a
            href="/admin/settings/people-import-template"
            download
            className={buttonClassName("ghost", "sm")}
          >
            Download CSV template
          </a>
        </div>
        {fileError ? <p className={errorTextClassName}>{fileError}</p> : null}
      </div>
      <div>
        <label htmlFor={payloadId} className={fieldLabelClassName}>
          …or paste CSV
        </label>
        <textarea
          ref={textareaRef}
          id={payloadId}
          name="payload"
          rows={8}
          placeholder={
            "full_name,email,phone,role\nJane Doe,jane@example.com,555-0100,leader\nJohn Smith,,,member"
          }
          className={cn(fieldInputClassName, "font-mono")}
        />
        <p className={fieldHintClassName}>
          Header row required. role must be leader or member; leaders need an
          email. Duplicate emails within the import are de-duplicated.
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
