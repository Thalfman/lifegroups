"use client";

import { EntityActionMenu } from "@/components/admin/contextual/entity-action-menu";
import { useContextualAction } from "@/components/lg/admin/contextual-action-provider";
import type { ContextualEntity } from "@/lib/admin/contextual-actions";
import type { UserRole } from "@/lib/auth/roles";

// The per-leader contextual action menu (#776 Phase 1, OPP-1). Dropped onto a
// Care accordion row and a leader-subject Notes-feed item, it lets an admin act
// on that shepherd — add a care note / prayer request, log a call/text/visit,
// set the next step, or create a follow-up — without leaving /admin/care. It is
// the generic EntityActionMenu (#781 OPP-6) bound to the "leader" entity and the
// shared contextual host: the registry answers "what can I do to a leader, and
// may I?", and choosing one opens the matching body in the shared drawer. No
// write path of its own; each body posts through the existing audited action. The
// transparency toggle is deliberately NOT here — it stays the standalone
// admin-only control, so the leader registry never carries it.
export function CareLeaderActionsMenu({
  leaderProfileId,
  leaderName,
  viewerRole,
}: {
  leaderProfileId: string;
  leaderName: string;
  viewerRole: UserRole;
}) {
  const { openAction } = useContextualAction();
  const entity: ContextualEntity = {
    kind: "leader",
    id: leaderProfileId,
    label: leaderName,
  };

  return (
    <EntityActionMenu
      entity={entity}
      viewerRole={viewerRole}
      // Visible label first (axe label-in-name), then the shepherd so the
      // repeated control carries record context (Admin Interaction Model req 4).
      triggerAriaLabel={`Care actions for ${leaderName}`}
      onSelect={(action) => openAction({ entity, action })}
    />
  );
}
