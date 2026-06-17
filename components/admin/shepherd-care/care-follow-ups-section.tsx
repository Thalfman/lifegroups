"use client";

import { PButton } from "@/components/pastoral/button";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import { CareFollowUpCreateForm } from "@/components/admin/shepherd-care/care-follow-up-create-form";
import { CareFollowUpList } from "@/components/admin/shepherd-care/care-follow-up-list";
import type { ShepherdCareFollowUpsRow } from "@/types/database";

// Leader care follow-ups, with creation moved into the shared Editing Pattern
// drawer (#268, Admin Interaction Model req 1 — P0 list-style editing only).
// Creating a follow-up used to render a full inline form stacked above the
// list, pushing it down; now "Add follow-up" opens the EditingSurface drawer
// out of the list flow, so the list never reflows and the page's scroll
// position survives the round trip. The dirty/in-flight bookkeeping lives in
// the shared useEditingDrawer hook.
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
  // Create drawer: closes + refreshes on save so the new follow-up appears.
  const drawer = useEditingDrawer();

  return (
    <div className="grid gap-4">
      <div>
        <PButton
          type="button"
          tone="terra"
          size="md"
          onClick={() => drawer.open(true)}
        >
          Add follow-up
        </PButton>
      </div>

      {followUps.length === 0 ? (
        <p className="m-0 font-sans text-sm italic text-ink3">
          {drawer.isOpen
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
        open={drawer.isOpen}
        onRequestClose={drawer.requestClose}
        eyebrow="Care follow-up"
        title="Add a follow-up"
        description={`A concrete next step you owe ${leaderName}. Admin-only — it never appears on leader or member surfaces.`}
        closeLabel={`Close new follow-up form for ${leaderName}`}
      >
        <CareFollowUpCreateForm
          careProfileId={careProfileId}
          shepherdProfileId={shepherdProfileId}
          onCancel={drawer.requestClose}
          onDirty={drawer.markDirty}
          onPendingChange={drawer.reportPending}
          onSaved={drawer.markSaved}
        />
      </EditingSurface>
      {drawer.discardDialog}
    </div>
  );
}
