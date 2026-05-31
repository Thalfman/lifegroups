"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { superAdminSetCopy } from "@/app/(protected)/admin/super-admin/editable-copy-actions";
import { EDITABLE_COPY_MAX_LENGTH } from "@/lib/admin/editable-copy";
import {
  errorTextStyle,
  fieldInputStyle,
  successTextStyle,
} from "./field-styles";
import type { ActionResult } from "@/lib/admin/action-result";

type State = ActionResult<{ id: string }> | undefined;

// Phase SAC.2 (#162): edit one configurable string. An empty value clears the
// override back to the built-in placeholder (resolveCopy treats blank as unset).
export function EditableCopyForm({
  copyKey,
  currentValue,
}: {
  copyKey: string;
  currentValue: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    superAdminSetCopy,
    undefined
  );

  return (
    <form
      key={currentValue}
      action={formAction}
      style={{ display: "grid", gap: 6, minWidth: 240 }}
    >
      <input type="hidden" name="key" value={copyKey} />
      <input
        type="text"
        name="value"
        defaultValue={currentValue}
        maxLength={EDITABLE_COPY_MAX_LENGTH}
        style={fieldInputStyle}
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save copy"}
        </PButton>
        {state?.ok ? <span style={successTextStyle}>Saved.</span> : null}
      </div>
      {state && !state.ok ? (
        <p style={errorTextStyle}>{state.errors.join(" ")}</p>
      ) : null}
    </form>
  );
}
