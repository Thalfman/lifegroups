"use client";

import { useState } from "react";
import { adminSetGroupTypes } from "@/app/(protected)/admin/settings/actions";
import {
  fieldInputClassName,
  fieldLabelClassName,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Settings > Groups: the admin-managed free-text group-type list. A single
// textarea, one type name per line. The validator (validateSetGroupTypesPayload)
// trims, dedupes (case-insensitive), and bounds the list; the audited
// admin_set_group_types RPC replaces the app_settings `group_types` row and stays
// the authoritative gate. The list is posted verbatim as `types_text`.
export function GroupTypesEditor({
  groupTypes,
}: {
  groupTypes: readonly string[];
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetGroupTypes
  );
  const [text, setText] = useState(groupTypes.join("\n"));

  return (
    <form action={formAction} className="grid gap-3">
      <p className={formNoteClassName}>
        Enter one group type per line. Blank lines are ignored and duplicate
        names are collapsed. A group then picks its type from this list, or
        stays Untyped.
      </p>
      <div>
        <label htmlFor="group-types-text" className={fieldLabelClassName}>
          Group types
        </label>
        <textarea
          id="group-types-text"
          name="types_text"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={cn(fieldInputClassName, "min-h-40 resize-y font-mono")}
          placeholder={"Men's\nWomen's\nMarried Couples\nYoung Adults"}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save group types"}
        </Button>
        <FormStatus state={state} successText="Group types saved." />
      </div>
    </form>
  );
}
