"use client";

import { PButton } from "@/components/pastoral/button";
import { superAdminSetCopy } from "@/app/(protected)/admin/super-admin/editable-copy-actions";
import { EDITABLE_COPY_MAX_LENGTH } from "@/lib/admin/editable-copy";
import { fieldInputStyle } from "./field-styles";
import { useActionForm, FormStatus } from "./action-form";

// Phase SAC.2 (#162): edit one configurable string. An empty value clears the
// override back to the built-in placeholder (resolveCopy treats blank as unset).
export function EditableCopyForm({
  copyKey,
  currentValue,
}: {
  copyKey: string;
  currentValue: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    superAdminSetCopy
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
        <FormStatus state={state} successText="Saved." />
      </div>
    </form>
  );
}
