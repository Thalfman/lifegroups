"use client";

// "Edit ratings" on the group detail Health tab: opens the SAME rating editor
// drawer (and audited write path) as the Group health triage, scoped to this
// one group — so the detail page stops bouncing the admin to a second surface
// to edit the grade it displays. /admin/group-health remains the all-groups
// triage view.

import { useRef, useState } from "react";
import type { GroupHealthOverviewRow } from "@/lib/admin/group-health-read";
import { GroupHealthEditorDrawer } from "@/components/admin/group-health/group-health-editor";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function GroupHealthEditButton({
  row,
  period,
  spiritualGrowthLabel,
  groupQuestionLabel,
  isSuperAdmin = false,
}: {
  row: GroupHealthOverviewRow;
  period: string;
  spiritualGrowthLabel: string;
  groupQuestionLabel: string;
  isSuperAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Whether the non-blocking discard prompt is open (replaces the old blocking
  // `window.confirm` so the dismissal click paints immediately).
  const [discardOpen, setDiscardOpen] = useState(false);
  // Unsaved-edit flag, written by the open editor's form and read on close so
  // we can warn before discarding (the triage's exact protocol).
  const dirtyRef = useRef(false);
  // A save in flight: ignore every dismissal route so a write can't resolve
  // (closing the drawer) while the non-blocking discard prompt is open.
  const submittingRef = useRef(false);

  const requestClose = () => {
    if (submittingRef.current) return;
    if (dirtyRef.current) {
      setDiscardOpen(true);
      return;
    }
    dirtyRef.current = false;
    setOpen(false);
  };

  // The discard prompt's confirm button: drop the unsaved edits and close.
  const confirmDiscard = () => {
    setDiscardOpen(false);
    dirtyRef.current = false;
    setOpen(false);
  };

  // Close without prompting (the edit was saved / there is nothing to discard).
  const forceClose = () => {
    dirtyRef.current = false;
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="sm"
        aria-label={`Edit ${row.group_name} health ratings`}
        onClick={() => {
          dirtyRef.current = false;
          setOpen(true);
        }}
      >
        Edit ratings
      </Button>
      <GroupHealthEditorDrawer
        row={open ? row : null}
        period={period}
        spiritualGrowthLabel={spiritualGrowthLabel}
        groupQuestionLabel={groupQuestionLabel}
        dirtyRef={dirtyRef}
        onRequestClose={requestClose}
        onSaved={forceClose}
        onPendingChange={(p) => {
          submittingRef.current = p;
        }}
        isSuperAdmin={isSuperAdmin}
      />
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard changes?"
        message="Discard unsaved changes to this group's ratings?"
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
      />
    </>
  );
}
