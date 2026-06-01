"use client";

import { PButton } from "@/components/pastoral/button";
import { superAdminSetPlatformConfig } from "@/app/(protected)/admin/super-admin/platform-config-actions";
import { P, fontBody } from "@/lib/pastoral";
import { fieldInputStyle, fieldLabelStyle } from "./field-styles";
import { APP_CONFIG_TRACER_MAX_LENGTH } from "@/lib/admin/app-config-decode";
import { useActionForm, FormStatus } from "./action-form";

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
    <form key={value} action={formAction} style={{ display: "grid", gap: 10 }}>
      <div>
        <label htmlFor="console_tracer_note" style={fieldLabelStyle}>
          Console tracer note
        </label>
        <input
          id="console_tracer_note"
          name="console_tracer_note"
          type="text"
          maxLength={APP_CONFIG_TRACER_MAX_LENGTH}
          defaultValue={value}
          placeholder="A short note that round-trips through the audited config store"
          style={fieldInputStyle}
        />
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 11,
            color: P.ink3,
            margin: "4px 0 0",
            lineHeight: 1.4,
          }}
        >
          Foundation tracer: saving persists via the audited super-admin RPC and
          reads back on reload. Up to {APP_CONFIG_TRACER_MAX_LENGTH} characters.
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save config"}
        </PButton>
        <FormStatus state={state} successText="Saved." />
      </div>
    </form>
  );
}
