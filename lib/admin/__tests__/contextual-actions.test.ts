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
