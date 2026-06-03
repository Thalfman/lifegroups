"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// The Editing Pattern drawer state machine, shared by every list-to-detail
// surface that edits in the EditingSurface drawer (Group health #259,
// Groups #266, Follow-ups #267, Leader care #268, People assignments #270).
// Hand-rolling it per surface drifted — e.g. one copy forgot to clear the
// dirty flag after a successful save and then falsely warned "discard?" on
// close — so the protocol lives here once.
//
// `target` doubles as both "is the drawer open" and "which record is open":
//   - A create drawer opens itself with `open(true)` (T defaults to `true`).
//   - A per-record drawer opens with `open(recordId)` and reads `target` to
//     know which record to render.
//
// `dirtyRef` / `submittingRef` are refs, not state, so typing into the form or
// a save in flight never re-renders the list behind the drawer. The caller
// wires them to its form: `markDirty` on change, `reportPending` on the
// in-flight flag, and `markSaved` once a write lands.
export function useEditingDrawer<T = true>(
  options: {
    // Close the drawer after a successful save. True for create drawers (the
    // form unmounts); false for additive drawers that stay open for the next
    // action (e.g. assigning several people to one group in a row).
    closeOnSave?: boolean;
    // Call router.refresh() after a save. Leave on when the surface relies on a
    // client refresh to see the new row; turn off when the server action's own
    // revalidatePath already re-renders the open drawer with fresh props.
    refreshOnSave?: boolean;
  } = {}
) {
  const { closeOnSave = true, refreshOnSave = true } = options;
  const router = useRouter();

  const [target, setTarget] = useState<T | null>(null);
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);

  const open = useCallback((next: T) => {
    dirtyRef.current = false;
    submittingRef.current = false;
    setTarget(next);
  }, []);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  const reportPending = useCallback((pending: boolean) => {
    submittingRef.current = pending;
  }, []);

  const requestClose = useCallback(() => {
    // A write is in flight: ignore every dismissal route (Escape, overlay, ×,
    // Cancel) so we don't unmount the form mid-write — it closes via markSaved
    // when the write lands.
    if (submittingRef.current) return;
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes?")) {
      return;
    }
    dirtyRef.current = false;
    setTarget(null);
  }, []);

  const markSaved = useCallback(() => {
    // The save succeeded, so there is nothing left to discard or to block on —
    // clear both flags before any close so the close never falsely warns.
    dirtyRef.current = false;
    submittingRef.current = false;
    if (closeOnSave) setTarget(null);
    if (refreshOnSave) router.refresh();
  }, [closeOnSave, refreshOnSave, router]);

  return {
    target,
    isOpen: target !== null,
    open,
    markDirty,
    reportPending,
    requestClose,
    markSaved,
  };
}
