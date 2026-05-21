import { describe, expect, it } from "vitest";
import {
  guardAgainstSelfRoleChange,
  guardAgainstSelfTarget,
  guardAgainstStaffViewerAssignment,
  guardAgainstSuperAdminAssignment,
  validateAssignLeaderToGroupPayload,
  validateChangeUserRolePayload,
  validateInviteUserPayload,
  validateLogShepherdCareInteractionPayload,
  validateUpsertShepherdCareProfilePayload,
} from "@/lib/admin/validation";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("validateInviteUserPayload", () => {
  it("rejects super_admin as an assignable role", () => {
    const r = validateInviteUserPayload({
      full_name: "X",
      email: "x@example.com",
      role: "super_admin",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /Role must be/i.test(e))).toBe(true);
    }
  });

  it("rejects staff_viewer as an assignable role", () => {
    const r = validateInviteUserPayload({
      full_name: "X",
      email: "x@example.com",
      role: "staff_viewer",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects ministry_admin paired with a group_id", () => {
    const r = validateInviteUserPayload({
      full_name: "Admin Alice",
      email: "alice@example.com",
      role: "ministry_admin",
      group_id: UUID_A,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => /ministry admins are not assigned to a group/i.test(e)),
      ).toBe(true);
    }
  });

  it("accepts a valid leader invite with a group_id and canonicalizes", () => {
    const r = validateInviteUserPayload({
      full_name: "  Leader Lee  ",
      email: "  Lee@Example.COM  ",
      role: "leader",
      group_id: UUID_A.toUpperCase(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.full_name).toBe("Leader Lee");
      expect(r.value.email).toBe("lee@example.com");
      expect(r.value.role).toBe("leader");
      expect(r.value.group_id).toBe(UUID_A);
    }
  });

  it("accepts a co_leader invite", () => {
    const r = validateInviteUserPayload({
      full_name: "Co Lee",
      email: "co@example.com",
      role: "co_leader",
      group_id: UUID_A,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects invalid email shape", () => {
    const r = validateInviteUserPayload({
      full_name: "X",
      email: "not-an-email",
      role: "leader",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateChangeUserRolePayload", () => {
  it("rejects non-uuid profile_id", () => {
    const r = validateChangeUserRolePayload({
      profile_id: "not-a-uuid",
      new_role: "leader",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown role", () => {
    const r = validateChangeUserRolePayload({
      profile_id: UUID_A,
      new_role: "ceo",
    });
    expect(r.ok).toBe(false);
  });

  it("canonicalizes uuid to lowercase on success", () => {
    const r = validateChangeUserRolePayload({
      profile_id: UUID_A.toUpperCase(),
      new_role: "ministry_admin",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.profile_id).toBe(UUID_A);
      expect(r.value.new_role).toBe("ministry_admin");
    }
  });
});

describe("validateAssignLeaderToGroupPayload", () => {
  it("rejects role='member'", () => {
    const r = validateAssignLeaderToGroupPayload({
      group_id: UUID_A,
      profile_id: UUID_B,
      role: "member",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts leader and co_leader", () => {
    for (const role of ["leader", "co_leader"] as const) {
      const r = validateAssignLeaderToGroupPayload({
        group_id: UUID_A,
        profile_id: UUID_B,
        role,
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.role).toBe(role);
    }
  });
});

describe("self-target guards", () => {
  it("guardAgainstSelfTarget blocks matching ids, allows different", () => {
    expect(guardAgainstSelfTarget(UUID_A, UUID_A)).not.toBeNull();
    expect(guardAgainstSelfTarget(UUID_A, UUID_A.toUpperCase())).not.toBeNull();
    expect(guardAgainstSelfTarget(UUID_A, UUID_B)).toBeNull();
  });

  it("guardAgainstSelfRoleChange blocks self role-change", () => {
    expect(
      guardAgainstSelfRoleChange(
        { id: UUID_A, role: "super_admin" },
        { profile_id: UUID_A, new_role: "ministry_admin" },
      ),
    ).not.toBeNull();
    expect(
      guardAgainstSelfRoleChange(
        { id: UUID_A, role: "super_admin" },
        { profile_id: UUID_B, new_role: "ministry_admin" },
      ),
    ).toBeNull();
  });

  it("guardAgainstSuperAdminAssignment blocks super_admin assignments", () => {
    expect(
      guardAgainstSuperAdminAssignment({
        profile_id: UUID_A,
        new_role: "super_admin",
      }),
    ).not.toBeNull();
    expect(
      guardAgainstSuperAdminAssignment({
        profile_id: UUID_A,
        new_role: "ministry_admin",
      }),
    ).toBeNull();
  });

  it("guardAgainstStaffViewerAssignment blocks staff_viewer assignments", () => {
    expect(
      guardAgainstStaffViewerAssignment({
        profile_id: UUID_A,
        new_role: "staff_viewer",
      }),
    ).not.toBeNull();
    expect(
      guardAgainstStaffViewerAssignment({
        profile_id: UUID_A,
        new_role: "leader",
      }),
    ).toBeNull();
  });
});

describe("validateUpsertShepherdCareProfilePayload", () => {
  it("rejects payload with no _set_ flag toggled", () => {
    const r = validateUpsertShepherdCareProfilePayload({
      shepherd_profile_id: UUID_A,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /at least one field/i.test(e))).toBe(true);
    }
  });

  it("rejects a non-uuid shepherd_profile_id", () => {
    const r = validateUpsertShepherdCareProfilePayload({
      shepherd_profile_id: "nope",
      set_current_status: "true",
      current_status: "healthy",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid status enum", () => {
    const r = validateUpsertShepherdCareProfilePayload({
      shepherd_profile_id: UUID_A,
      set_current_status: "true",
      current_status: "great",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects oversized summary", () => {
    const r = validateUpsertShepherdCareProfilePayload({
      shepherd_profile_id: UUID_A,
      set_admin_summary: "true",
      admin_summary: "a".repeat(2001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /too long/i.test(e))).toBe(true);
    }
  });

  it("accepts a status-only update and canonicalizes the uuid", () => {
    const r = validateUpsertShepherdCareProfilePayload({
      shepherd_profile_id: UUID_A.toUpperCase(),
      set_current_status: "true",
      current_status: "watch",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shepherd_profile_id).toBe(UUID_A);
      expect(r.value.set_current_status).toBe(true);
      expect(r.value.current_status).toBe("watch");
      expect(r.value.set_next_touchpoint_due).toBe(false);
      expect(r.value.set_admin_summary).toBe(false);
    }
  });
});

describe("validateLogShepherdCareInteractionPayload", () => {
  it("rejects missing required fields", () => {
    const r = validateLogShepherdCareInteractionPayload({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /shepherd_profile_id/i.test(e))).toBe(true);
      expect(r.errors.some((e) => /interaction date/i.test(e))).toBe(true);
      expect(r.errors.some((e) => /interaction type/i.test(e))).toBe(true);
    }
  });

  it("rejects a future interaction date", () => {
    const r = validateLogShepherdCareInteractionPayload(
      {
        shepherd_profile_id: UUID_A,
        interaction_at: "2030-01-01",
        interaction_type: "call",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /future/i.test(e))).toBe(true);
    }
  });

  it("allows interaction_at on UTC today + 1 for timezones ahead of UTC", () => {
    const r = validateLogShepherdCareInteractionPayload(
      {
        shepherd_profile_id: UUID_A,
        interaction_at: "2026-05-22",
        interaction_type: "call",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(true);
  });

  it("rejects interaction_at two days ahead of UTC today", () => {
    const r = validateLogShepherdCareInteractionPayload(
      {
        shepherd_profile_id: UUID_A,
        interaction_at: "2026-05-23",
        interaction_type: "call",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /future/i.test(e))).toBe(true);
    }
  });

  it("rejects an invalid interaction type", () => {
    const r = validateLogShepherdCareInteractionPayload(
      {
        shepherd_profile_id: UUID_A,
        interaction_at: "2026-05-01",
        interaction_type: "smoke_signal",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects oversized notes", () => {
    const r = validateLogShepherdCareInteractionPayload(
      {
        shepherd_profile_id: UUID_A,
        interaction_at: "2026-05-01",
        interaction_type: "call",
        notes: "x".repeat(2001),
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /too long/i.test(e))).toBe(true);
    }
  });

  it("accepts a happy-path interaction without optional flags", () => {
    const r = validateLogShepherdCareInteractionPayload(
      {
        shepherd_profile_id: UUID_A,
        interaction_at: "2026-05-01",
        interaction_type: "call",
        notes: "  Caught up over coffee.  ",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shepherd_profile_id).toBe(UUID_A);
      expect(r.value.interaction_type).toBe("call");
      expect(r.value.notes).toBe("Caught up over coffee.");
      expect(r.value.set_next_touchpoint_due).toBe(false);
      expect(r.value.next_touchpoint_due).toBeNull();
      expect(r.value.set_current_status).toBe(false);
    }
  });

  it("respects set_next_touchpoint_due flag and parses status when set", () => {
    const r = validateLogShepherdCareInteractionPayload(
      {
        shepherd_profile_id: UUID_A,
        interaction_at: "2026-05-21",
        interaction_type: "in_person",
        notes: "",
        set_next_touchpoint_due: "true",
        next_touchpoint_due: "2026-06-05",
        set_current_status: "true",
        current_status: "needs_attention",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.set_next_touchpoint_due).toBe(true);
      expect(r.value.next_touchpoint_due).toBe("2026-06-05");
      expect(r.value.set_current_status).toBe(true);
      expect(r.value.current_status).toBe("needs_attention");
      expect(r.value.notes).toBeNull();
    }
  });
});
