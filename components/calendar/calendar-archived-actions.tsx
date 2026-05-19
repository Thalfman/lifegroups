"use client";

import { useActionState } from "react";
import { PButton } from "@/components/pastoral/button";
import { errorTextStyle } from "@/components/admin/forms/field-styles";

type ActionResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
type State = ActionResult<{ id: string }> | undefined;
type ServerAction = (prev: State, input: FormData) => Promise<State>;

// Single Restore button used on the archived tab. The archived tab is
// the only surface where archived rows are visible; restoring them
// re-applies the override on the calendar grid. The complementary
// "Clear override" lives inside the editor modal in
// calendar-occurrence-editor.tsx.
export function ArchivedRestoreButton({
  eventId,
  groupId,
  action,
}: {
  eventId: string;
  groupId: string;
  action: ServerAction;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    action,
    undefined,
  );
  return (
    <form
      action={formAction}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
      }}
    >
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="group_id" value={groupId} />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "Restoring…" : "Restore override"}
      </PButton>
      {state && !state.ok ? (
        <p style={{ ...errorTextStyle, maxWidth: 220, fontSize: 12 }}>
          {state.errors[0]}
        </p>
      ) : null}
    </form>
  );
}
