"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  actionsForEntity,
  type ContextualAction,
  type ContextualEntity,
} from "@/lib/admin/contextual-actions";
import type { UserRole } from "@/lib/auth/roles";

// The generic, registry-driven entity action menu (#781 OPP-6). Generalizes the
// Care row's CareLeaderActionsMenu: given an entity (kind + id + label) and the
// viewer's role, it renders the role-gated actions the entity→actions registry
// allows — the one answer to "what can I do to this thing, and may I?". It owns
// no drawer and no write path; choosing an item calls `onSelect(action)` and the
// caller decides where the action resolves (the shared contextual host on the
// Care row / dashboard, or a header-owned drawer on a detail page).
//
// `actionFilter` lets a caller narrow the registry set by INSTANCE applicability
// (e.g. "change role" only for a leader, "archive" only for an active person) on
// top of the registry's role gate — the registry stays the single source of the
// label/role-gate, the caller refines by the concrete record.
export function EntityActionMenu({
  entity,
  viewerRole,
  triggerAriaLabel,
  triggerLabel = "Actions",
  actionFilter,
  onSelect,
}: {
  entity: ContextualEntity;
  viewerRole: UserRole;
  // Visible label first, then record context, so a repeated control in a list
  // stays uniquely named for screen readers (Admin Interaction Model req 4).
  triggerAriaLabel: string;
  triggerLabel?: string;
  actionFilter?: (action: ContextualAction) => boolean;
  onSelect: (action: ContextualAction) => void;
}) {
  let actions = actionsForEntity(entity.kind, viewerRole);
  if (actionFilter) actions = actions.filter(actionFilter);
  // Render nothing when no action resolves — a non-admin viewer, or an entity
  // whose every action is filtered out (e.g. an already-archived person).
  if (actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={triggerAriaLabel}
        className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface px-3 py-1.5 font-sans text-sm font-semibold text-ink2 transition-colors duration-150 hover:bg-surfaceAlt"
      >
        {triggerLabel}
        <span aria-hidden="true" className="text-ink3">
          ▾
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            onSelect={() => onSelect(action)}
            className="cursor-pointer rounded-sm px-2.5 py-1.5 font-sans text-sm text-ink outline-none transition-colors duration-150 data-[highlighted]:bg-surfaceAlt"
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
