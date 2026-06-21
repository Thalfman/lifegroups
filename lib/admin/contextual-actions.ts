import type { UserRole } from "@/lib/auth/roles";
import { isAdminRole, isSuperAdminRole } from "@/lib/auth/roles";

// The entity→actions registry (#776 Phase 0, skeleton). One typed answer to
// "what can I do to this thing, and may I?" so later surfaces (the Care row,
// group/person detail headers, the dashboard queue) read affordances + role
// gating from one place instead of each re-deciding. This file is deliberately
// React-free — it maps entity kinds to action descriptors; the host
// (`contextual-action-provider`) owns the drawer + renders the bodies.
//
// Phase 0 seeds a single sample entry (the group Edit drawer, OPP-2's shape);
// later phases register actions as they need them (§6: the registry earns its
// keep at ~3+ surfaces, not on day one).

// The kinds of thing the contextual layer can act on.
export type ContextualEntityKind =
  | "group"
  | "leader"
  | "person"
  | "prospect"
  | "over_shepherd"
  | "candidate"
  | "follow_up";

// How an action resolves once chosen — inline (optimistic toggle), in the
// shared drawer, or via a redirect-and-return round trip.
export type ContextualActionModel = "inline" | "drawer" | "redirect-and-return";

// Who may see/run an action. A small closed set (not free predicates) so gating
// stays declarative and auditable in one place, resolved against UserRole below.
export type ContextualRoleGate = "admin" | "super_admin";

// The drawer-body identifiers the host knows how to render. Extended per phase
// as real form bodies are registered; Phase 0 seeded the group editor, Phase 1
// (#776 OPP-1) adds the Care drawer bodies.
export type ContextualActionBodyKey =
  | "group_editor"
  | "care_note_writer"
  | "prayer_request_writer"
  | "care_log_touch"
  | "care_set_touchpoint"
  | "care_create_follow_up";

// Actions that expose a visibility-exception surface (the admin-only
// transparency grant, the encrypted SC.4 private note). They must NEVER appear
// on a leader-entity definition — enforced at module load (assertLeaderSafe)
// and by the colocated test, with RLS as the runtime backstop.
export type SensitiveActionId =
  | "transparency_toggle"
  | "edit_admin_private_note";

export const SENSITIVE_ACTION_IDS: ReadonlySet<string> =
  new Set<SensitiveActionId>([
    "transparency_toggle",
    "edit_admin_private_note",
  ]);

// A single registered action. `body` names the drawer form for `model: "drawer"`
// actions; inline / redirect actions leave it undefined.
export type ContextualAction = {
  id: string;
  label: string;
  model: ContextualActionModel;
  roleGate: ContextualRoleGate;
  destructive?: boolean;
  body?: ContextualActionBodyKey;
};

export type ContextualActionRegistry = Record<
  ContextualEntityKind,
  readonly ContextualAction[]
>;

// A concrete target the layer acts on (the entity kind + its id, plus an
// optional human label for the drawer header).
export type ContextualEntity = {
  kind: ContextualEntityKind;
  id: string;
  label?: string;
};

export const CONTEXTUAL_ACTION_REGISTRY: ContextualActionRegistry = {
  group: [
    {
      id: "edit_group",
      label: "Edit",
      model: "drawer",
      roleGate: "admin",
      body: "group_editor",
    },
  ],
  // The Care row / Notes-feed actions (#776 Phase 1, OPP-1). All admin-only and
  // resolved in the shared drawer. The `log_*` trio share one body (`care_log_touch`,
  // which maps the action id → interaction type, mirroring `care-actions.tsx`).
  // None of these ids is in SENSITIVE_ACTION_IDS, so `assertLeaderSafe` stays
  // satisfied: the transparency toggle is a standalone admin-only control (never
  // a leader-entity action), and the encrypted SC.4 private note is never wired.
  leader: [
    {
      id: "add_care_note",
      label: "Add care note",
      model: "drawer",
      roleGate: "admin",
      body: "care_note_writer",
    },
    {
      id: "add_prayer_request",
      label: "Add prayer request",
      model: "drawer",
      roleGate: "admin",
      body: "prayer_request_writer",
    },
    {
      id: "log_call",
      label: "Log call",
      model: "drawer",
      roleGate: "admin",
      body: "care_log_touch",
    },
    {
      id: "log_text",
      label: "Log text",
      model: "drawer",
      roleGate: "admin",
      body: "care_log_touch",
    },
    {
      id: "log_visit",
      label: "Log visit",
      model: "drawer",
      roleGate: "admin",
      body: "care_log_touch",
    },
    {
      id: "set_touchpoint",
      label: "Set next step",
      model: "drawer",
      roleGate: "admin",
      body: "care_set_touchpoint",
    },
    {
      id: "create_follow_up",
      label: "Create follow-up",
      model: "drawer",
      roleGate: "admin",
      body: "care_create_follow_up",
    },
  ],
  person: [],
  prospect: [],
  over_shepherd: [],
  candidate: [],
  follow_up: [],
};

export function passesRoleGate(
  gate: ContextualRoleGate,
  role: UserRole
): boolean {
  return gate === "super_admin" ? isSuperAdminRole(role) : isAdminRole(role);
}

// Resolve the actions available on an entity kind for a given role — the single
// entry point surfaces use to build a menu / affordance.
export function actionsForEntity(
  kind: ContextualEntityKind,
  role: UserRole,
  registry: ContextualActionRegistry = CONTEXTUAL_ACTION_REGISTRY
): ContextualAction[] {
  return registry[kind].filter((action) =>
    passesRoleGate(action.roleGate, role)
  );
}

// Module-load + test guard: no leader-entity action may expose a visibility
// exception. Throws fast so a careless future entry can't ship a transparency /
// private-note control onto a leader surface.
export function assertLeaderSafe(
  registry: ContextualActionRegistry = CONTEXTUAL_ACTION_REGISTRY
): void {
  const leaked = registry.leader.filter((action) =>
    SENSITIVE_ACTION_IDS.has(action.id)
  );
  if (leaked.length > 0) {
    throw new Error(
      `Leader entity exposes sensitive action(s): ${leaked
        .map((a) => a.id)
        .join(", ")}`
    );
  }
}

assertLeaderSafe();
