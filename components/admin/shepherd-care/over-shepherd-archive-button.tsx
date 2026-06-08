"use client";

import type { FormEvent } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetOverShepherdActive } from "@/app/(protected)/admin/shepherd-care/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";

// A focused Archive / Restore toggle for an over-shepherd, usable from the list
// and the detail page. Archiving is the soft-archive convention: the record
// stays in history and on its past coverage assignments; it just drops off the
// active picker. Archiving also soft-ends the over-shepherd's *active* coverage
// assignments (#423), so the leaders they covered fall to Unassigned for
// reassignment rather than silently vanishing from the Coverage tab. Restore
// brings the over-shepherd back but does NOT re-create coverage. Posts to the
// dedicated active-toggle action so no other field is touched.
export function OverShepherdArchiveButton({
  overShepherdId,
  fullName,
  active,
  coveredCount = 0,
}: {
  overShepherdId: string;
  fullName: string;
  active: boolean;
  // Leaders currently covered, so the archive confirm can warn how many will be
  // un-covered (their coverage is ended, #423).
  coveredCount?: number;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetOverShepherdActive
  );

  function confirmToggle(e: FormEvent<HTMLFormElement>) {
    if (!active) return; // restoring needs no confirmation
    const coverageNote =
      coveredCount > 0
        ? ` This ends coverage for ${coveredCount} leader${coveredCount === 1 ? "" : "s"}; they move to Unassigned for reassignment.`
        : "";
    if (
      !window.confirm(
        `Archive ${fullName}? They stay in history but drop off the active list. Restore any time (coverage is not restored).${coverageNote}`
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div style={{ display: "grid", gap: 4, justifyItems: "start" }}>
      <form action={formAction} onSubmit={confirmToggle}>
        <input type="hidden" name="over_shepherd_id" value={overShepherdId} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <PButton
          type="submit"
          tone="ghost"
          size="sm"
          disabled={pending}
          aria-label={`${active ? "Archive" : "Restore"} over-shepherd ${fullName}`}
        >
          {pending
            ? active
              ? "Archiving…"
              : "Restoring…"
            : active
              ? "Archive"
              : "Restore"}
        </PButton>
      </form>
      <FormStatus state={state} />
    </div>
  );
}
