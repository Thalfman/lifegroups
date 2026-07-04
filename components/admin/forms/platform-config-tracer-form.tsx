"use client";

import { superAdminSetPlatformConfig } from "@/app/(protected)/admin/super-admin/platform-config-actions";
import {
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
} from "./field-styles";
import { APP_CONFIG_TRACER_MAX_LENGTH } from "@/lib/admin/app-config-decode";
import { useActionForm, FormStatus } from "./action-form";
import { Button } from "@/components/ui/button";

// Phase SAC.1 (#159): the foundation's round-trip tracer. Saving persists the
// note through the audited super-admin RPC; the page revalidates and the new
// value flows back in via the `value` prop. Keying the form on `value` remounts
// the uncontrolled input so it reflects the freshly-persisted value, proving
// the set -> persist -> read loop end to end.
export function PlatformConfigTracerForm({ value }: { value: string }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    superAdminSetPlatformConfig
  );

  return (
    <form key={value} action={formAction} className="grid gap-2.5">
      <div>
        <label htmlFor="console_tracer_note" className={fieldLabelClassName}>
          Test note
        </label>
        <input
          id="console_tracer_note"
          name="console_tracer_note"
          type="text"
          maxLength={APP_CONFIG_TRACER_MAX_LENGTH}
          defaultValue={value}
          placeholder="A short note to confirm settings save and reload"
          className={fieldInputClassName}
        />
        <p className={fieldHintClassName}>
          Saving stores this note and reloads it from the database: a quick
          check that owner settings persist. Up to{" "}
          {APP_CONFIG_TRACER_MAX_LENGTH} characters.
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save note"}
        </Button>
        <FormStatus state={state} successText="Saved." />
      </div>
    </form>
  );
}
