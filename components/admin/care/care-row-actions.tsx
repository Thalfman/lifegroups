"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useContextualAction } from "@/components/lg/admin/contextual-action-provider";
import { actionsForEntity } from "@/lib/admin/contextual-actions";
import type { UserRole } from "@/lib/auth/roles";

// The per-leader contextual action menu (#776 Phase 1, OPP-1). Dropped onto a
// Care accordion row and a leader-subject Notes-feed item, it lets an admin act
// on that shepherd — add a care note / prayer request, log a call/text/visit,
// set the next step, or create a follow-up — without leaving /admin/care. The
// items come from the entity→actions registry (one source of "what can I do to a
// leader, and may I?"), and choosing one opens the matching body in the shared
// drawer. No write path of its own; each body posts through the existing audited
// action. The transparency toggle is deliberately NOT here — it stays the
// standalone admin-only control, so the leader registry never carries it.
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
  const actions = actionsForEntity("leader", viewerRole);
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // Visible label first (axe label-in-name), then the shepherd so the
        // repeated control carries record context (Admin Interaction Model req 4).
        aria-label={`Care actions for ${leaderName}`}
        className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface px-3 py-1.5 font-sans text-sm font-semibold text-ink2 transition-colors duration-150 hover:bg-surfaceAlt"
      >
        Actions
        <span aria-hidden="true" className="text-ink3">
          ▾
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            onSelect={() =>
              openAction({
                entity: {
                  kind: "leader",
                  id: leaderProfileId,
                  label: leaderName,
                },
                action,
              })
            }
            className="cursor-pointer rounded-sm px-2.5 py-1.5 font-sans text-sm text-ink outline-none transition-colors duration-150 data-[highlighted]:bg-surfaceAlt"
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
