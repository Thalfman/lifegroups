"use client";

import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { ActionResult } from "@/lib/shared/action-result";
import { Button } from "@/components/ui/button";

type ServerAction = (
  prev: ActionResult<{ id: string }> | undefined,
  input: FormData
) => Promise<ActionResult<{ id: string }>>;

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
  const { state, formAction, pending } = useActionForm<{ id: string }>(action);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="group_id" value={groupId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Restoring…" : "Restore override"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
