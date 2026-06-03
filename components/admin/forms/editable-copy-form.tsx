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
  inputId,
}: {
  copyKey: string;
  currentValue: string;
  // Optional id so a caller-rendered <label htmlFor> can associate with the
  // text input (Settings General tab, #304). When absent the field is unchanged
  // for existing callers (the Super Admin Console renders its own label text).
  inputId?: string;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    superAdminSetCopy
  );

  return (
    <form
      key={currentValue}
      action={formAction}
      // min(240px, 100%): keep a comfortable desktop minimum but never force a
      // width wider than a narrow phone viewport (Admin Interaction Model req 13).
      style={{ display: "grid", gap: 6, minWidth: "min(240px, 100%)" }}
    >
      <input type="hidden" name="key" value={copyKey} />
      <input
        id={inputId}
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
