import { describe, expect, it } from "vitest";

import {
  CONTEXTUAL_ACTION_REGISTRY,
  SENSITIVE_ACTION_IDS,
  actionsForEntity,
  assertLeaderSafe,
  passesRoleGate,
  type ContextualActionRegistry,
} from "@/lib/admin/contextual-actions";

// #776 Phase 0 — the entity→actions registry skeleton. These pin the contract
// later surfaces depend on: actions resolve per kind, role gating filters
// admin vs super-admin, and a leader-entity definition can never expose a
// visibility-exception action (transparency / private note).
describe("contextual-actions registry", () => {
  it("resolves the seeded group Edit action for an admin", () => {
    const actions = actionsForEntity("group", "ministry_admin");
    expect(actions.map((a) => a.id)).toEqual(["edit_group"]);
    expect(actions[0]).toMatchObject({ model: "drawer", body: "group_editor" });
  });

  it("admits both admin roles through the default admin gate", () => {
    for (const role of ["ministry_admin", "super_admin"] as const) {
      expect(actionsForEntity("group", role).map((a) => a.id)).toEqual([
        "edit_group",
      ]);
    }
  });

  it("gates non-admin roles out of admin actions", () => {
    for (const role of ["leader", "co_leader", "over_shepherd"] as const) {
      expect(actionsForEntity("group", role)).toEqual([]);
    }
  });

  // #776 Phase 1 (OPP-1) — the Care row / Notes-feed leader actions.
  describe("leader (Care) actions", () => {
    const EXPECTED_LEADER_ACTIONS = [
      "add_care_note",
      "add_prayer_request",
      "log_call",
      "log_text",
      "log_visit",
      "set_status",
      "set_touchpoint",
      "create_follow_up",
    ];
    const VALID_BODY_KEYS = new Set([
      "group_editor",
      "care_note_writer",
      "prayer_request_writer",
      "care_log_touch",
      "care_set_status",
      "care_set_touchpoint",
      "care_create_follow_up",
    ]);

    it("resolves the OPP-1 actions for both admin roles", () => {
      for (const role of ["ministry_admin", "super_admin"] as const) {
        expect(actionsForEntity("leader", role).map((a) => a.id)).toEqual(
          EXPECTED_LEADER_ACTIONS
        );
      }
    });

    it("gates every non-admin role out of the leader actions", () => {
      for (const role of ["leader", "co_leader", "over_shepherd"] as const) {
        expect(actionsForEntity("leader", role)).toEqual([]);
      }
    });

    it("every drawer action names a known body key", () => {
      for (const action of CONTEXTUAL_ACTION_REGISTRY.leader) {
        expect(action.model).toBe("drawer");
        expect(action.body).toBeDefined();
        expect(VALID_BODY_KEYS.has(action.body as string)).toBe(true);
      }
    });

    it("exposes neither the transparency toggle nor the private note", () => {
      const ids = CONTEXTUAL_ACTION_REGISTRY.leader.map((a) => a.id);
      expect(ids).not.toContain("transparency_toggle");
      expect(ids).not.toContain("edit_admin_private_note");
    });
  });

  describe("passesRoleGate", () => {
    it("super_admin gate admits only the super admin", () => {
      expect(passesRoleGate("super_admin", "super_admin")).toBe(true);
      expect(passesRoleGate("super_admin", "ministry_admin")).toBe(false);
    });

    it("admin gate admits both admin roles, no others", () => {
      expect(passesRoleGate("admin", "ministry_admin")).toBe(true);
      expect(passesRoleGate("admin", "super_admin")).toBe(true);
      expect(passesRoleGate("admin", "leader")).toBe(false);
    });
  });

  describe("assertLeaderSafe", () => {
    it("passes for the shipped registry (leader exposes no sensitive action)", () => {
      expect(() => assertLeaderSafe()).not.toThrow();
      for (const action of CONTEXTUAL_ACTION_REGISTRY.leader) {
        expect(SENSITIVE_ACTION_IDS.has(action.id)).toBe(false);
      }
    });

    it("throws if a leader definition leaks a sensitive action", () => {
      const bad: ContextualActionRegistry = {
        ...CONTEXTUAL_ACTION_REGISTRY,
        leader: [
          {
            id: "transparency_toggle",
            label: "Toggle transparency",
            model: "inline",
            roleGate: "admin",
          },
        ],
      };
      expect(() => assertLeaderSafe(bad)).toThrow(/transparency_toggle/);
    });
  });
});
