"use client";

import { adminSetOverShepherdActive } from "@/app/(protected)/admin/shepherd-care/actions";
import { ConfirmActionButton } from "@/components/admin/forms/confirm-action-button";

// A focused Archive / Restore toggle for an over-shepherd, usable from the list
// and the detail page. Archiving is the soft-archive convention: the record
// stays in history and on its past coverage assignments; it just drops off the
// active picker. Archiving also soft-ends the over-shepherd's *active* coverage
// assignments (#423), so the leaders they covered fall to Unassigned for
// reassignment rather than silently vanishing from the Coverage tab. Restore
// brings the over-shepherd back but does NOT re-create coverage. Posts to the
// dedicated active-toggle action so no other field is touched.

// Exported so the copy stays byte-locked by the confirm-action-button test.
export function overShepherdArchiveConfirmMessage(
  fullName: string,
  coveredCount: number
): string {
  const coverageNote =
    coveredCount > 0
      ? ` This ends coverage for ${coveredCount} leader${coveredCount === 1 ? "" : "s"}; they move to Unassigned for reassignment.`
      : "";
  return `Archive ${fullName}? They stay in history but drop off the active list. Restore any time (coverage is not restored).${coverageNote}`;
}

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
  return (
    <ConfirmActionButton
      action={adminSetOverShepherdActive}
      // Restoring needs no confirmation — only the archive direction asks.
      confirmMessage={
        active
          ? overShepherdArchiveConfirmMessage(fullName, coveredCount)
          : null
      }
      hiddenFields={[
        { name: "over_shepherd_id", value: overShepherdId },
        { name: "active", value: active ? "false" : "true" },
      ]}
      idleLabel={active ? "Archive" : "Restore"}
      pendingLabel={active ? "Archiving…" : "Restoring…"}
      tone="ghost"
      ariaLabel={`${active ? "Archive" : "Restore"} over-shepherd ${fullName}`}
      gap={4}
      alignEnd={false}
    />
  );
}
