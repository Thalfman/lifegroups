"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PButton } from "@/components/pastoral/button";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { CareFollowUpCreateForm } from "@/components/admin/shepherd-care/care-follow-up-create-form";
import { CareFollowUpList } from "@/components/admin/shepherd-care/care-follow-up-list";
import { P, fontBody } from "@/lib/pastoral";
import type { ShepherdCareFollowUpsRow } from "@/types/database";

// Leader care follow-ups, with creation moved into the shared Editing Pattern
// drawer (#268, Admin Interaction Model req 1 — P0 list-style editing only).
// Creating a follow-up used to render a full inline form stacked above the
// list, pushing it down; now "Add follow-up" opens the EditingSurface drawer
// out of the list flow, so the list never reflows and the page's scroll
// position survives the round trip. `dirtyRef` (typed-into form → warn before
// discarding) and `submittingRef` (a create in flight → block dismissal) are
// refs, not state, so neither typing nor an in-flight save re-renders the list
// behind the drawer.
//
// Per-row status quick-actions (Start / Mark done / Reopen) stay on the list:
// they are single-action transitions that already carry record context in
// their accessible names, not list-style editing forms. The broader care-action
// simplification is P1 (step 14, #272).
export function CareFollowUpsSection({
  careProfileId,
  shepherdProfileId,
  followUps,
  todayIso,
  leaderName,
}: {
  careProfileId: string;
  shepherdProfileId: string;
  followUps: ShepherdCareFollowUpsRow[];
  todayIso: string;
  // The leader this care record is for, so the create drawer's controls carry
  // record context (req 1) rather than a bare "Close".
  leaderName: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);

  const openCreate = useCallback(() => {
    dirtyRef.current = false;
    setCreateOpen(true);
  }, []);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);
  const reportPending = useCallback((pending: boolean) => {
    submittingRef.current = pending;
  }, []);
  const requestClose = useCallback(() => {
    // A create is in flight: ignore every dismissal route (Escape, overlay, ×,
    // Cancel) so we don't unmount the form mid-write — it auto-closes via
    // onSaved when the write lands.
    if (submittingRef.current) return;
    if (dirtyRef.current && !window.confirm("Discard your unsaved changes?")) {
      return;
    }
    dirtyRef.current = false;
    setCreateOpen(false);
  }, []);
  const handleSaved = useCallback(() => {
    dirtyRef.current = false;
    submittingRef.current = false;
    setCreateOpen(false);
    // Refresh so the new follow-up appears in the list immediately (the server
    // action revalidates the detail page too).
    router.refresh();
  }, [router]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <PButton type="button" tone="terra" size="md" onClick={openCreate}>
          Add follow-up
        </PButton>
      </div>

      {followUps.length === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          {createOpen
            ? "Fill in the details in the panel and save to add the first one."
            : "No follow-ups yet. Use Add follow-up to capture the next concrete step you owe this leader."}
        </p>
      ) : (
        <CareFollowUpList
          followUps={followUps}
          shepherdProfileId={shepherdProfileId}
          todayIso={todayIso}
        />
      )}

      {/* One always-mounted drawer (open toggled) so Radix owns the focus trap
          and focus restore, matching the Follow-up create flow (#267). Creation
          opens here, out of the list flow, so the list never reflows. */}
      <EditingSurface
        open={createOpen}
        onRequestClose={requestClose}
        eyebrow="Care follow-up"
        title="Add a follow-up"
        description={`A concrete next step you owe ${leaderName}. Admin-only — it never appears on leader or member surfaces.`}
        closeLabel={`Close new follow-up form for ${leaderName}`}
      >
        <CareFollowUpCreateForm
          careProfileId={careProfileId}
          shepherdProfileId={shepherdProfileId}
          onCancel={requestClose}
          onDirty={markDirty}
          onPendingChange={reportPending}
          onSaved={handleSaved}
        />
      </EditingSurface>
    </div>
  );
}
