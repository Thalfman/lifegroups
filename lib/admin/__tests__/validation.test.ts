import { describe, expect, it } from "vitest";
import {
  guardAgainstSelfRoleChange,
  guardAgainstSelfTarget,
  guardAgainstStaffViewerAssignment,
  guardAgainstSuperAdminAssignment,
  validateAssignLeaderToGroupPayload,
  validateAssignShepherdCoveragePayload,
  validateChangeUserRolePayload,
  validateCreateLaunchPlanningScenarioPayload,
  validateCreateOverShepherdPayload,
  validateEndShepherdCoverageAssignmentPayload,
  validateInviteUserPayload,
  validateLaunchPlanningAssumptionsPayload,
  validateCreateMultiplicationCandidatePayload,
  validateLogShepherdCareInteractionPayload,
  validateMetricDefaultsPayload,
  validateRecordChurchAttendancePayload,
  validateScenarioIdPayload,
  validateUpdateMultiplicationCandidatePayload,
  validateUpdateLaunchPlanningScenarioPayload,
  validateUpdateOverShepherdPayload,
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

// Phase 5D.1 — over-shepherd coverage tracking (SC.2).

describe("validateCreateOverShepherdPayload", () => {
  it("rejects missing full_name", () => {
    const r = validateCreateOverShepherdPayload({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /full name/i.test(e))).toBe(true);
    }
  });

  it("rejects oversized full_name", () => {
    const r = validateCreateOverShepherdPayload({
      full_name: "a".repeat(201),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /too long/i.test(e))).toBe(true);
    }
  });

  it("rejects invalid email", () => {
    const r = validateCreateOverShepherdPayload({
      full_name: "Coach Carla",
      email: "not-an-email",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /email/i.test(e))).toBe(true);
    }
  });

  it("rejects invalid phone", () => {
    const r = validateCreateOverShepherdPayload({
      full_name: "Coach Carla",
      phone: "abc",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /phone/i.test(e))).toBe(true);
    }
  });

  it("rejects oversized notes", () => {
    const r = validateCreateOverShepherdPayload({
      full_name: "Coach Carla",
      notes: "x".repeat(2001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /too long/i.test(e))).toBe(true);
    }
  });

  it("accepts a happy-path create and canonicalizes email", () => {
    const r = validateCreateOverShepherdPayload({
      full_name: "  Coach Carla  ",
      email: "  Carla@Example.COM  ",
      phone: "  +1 (555) 123-4567  ",
      notes: "  Long-time coach.  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.full_name).toBe("Coach Carla");
      expect(r.value.email).toBe("carla@example.com");
      expect(r.value.phone).toBe("+1 (555) 123-4567");
      expect(r.value.notes).toBe("Long-time coach.");
    }
  });

  it("accepts a create with only full_name and nulls the rest", () => {
    const r = validateCreateOverShepherdPayload({
      full_name: "Coach Carla",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBeNull();
      expect(r.value.phone).toBeNull();
      expect(r.value.notes).toBeNull();
    }
  });
});

describe("validateUpdateOverShepherdPayload", () => {
  it("rejects non-uuid over_shepherd_id", () => {
    const r = validateUpdateOverShepherdPayload({
      over_shepherd_id: "nope",
      full_name: "Coach Carla",
      active: "true",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects missing full_name on update", () => {
    const r = validateUpdateOverShepherdPayload({
      over_shepherd_id: UUID_A,
      active: "true",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /full name/i.test(e))).toBe(true);
    }
  });

  it("rejects invalid email on update", () => {
    const r = validateUpdateOverShepherdPayload({
      over_shepherd_id: UUID_A,
      full_name: "Coach Carla",
      email: "bogus",
      active: "true",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a happy-path update and canonicalizes uuid + email", () => {
    const r = validateUpdateOverShepherdPayload({
      over_shepherd_id: UUID_A.toUpperCase(),
      full_name: "Coach Carla",
      email: "Carla@Example.com",
      phone: "+1 555 123 4567",
      notes: "Notes here.",
      active: "false",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.over_shepherd_id).toBe(UUID_A);
      expect(r.value.full_name).toBe("Coach Carla");
      expect(r.value.email).toBe("carla@example.com");
      expect(r.value.active).toBe(false);
    }
  });

  it("treats missing active as false (form did not check the box)", () => {
    const r = validateUpdateOverShepherdPayload({
      over_shepherd_id: UUID_A,
      full_name: "Coach Carla",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.active).toBe(false);
  });
});

describe("validateAssignShepherdCoveragePayload", () => {
  it("rejects non-uuid shepherd_profile_id", () => {
    const r = validateAssignShepherdCoveragePayload({
      shepherd_profile_id: "nope",
      over_shepherd_id: UUID_B,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /shepherd_profile_id/i.test(e))).toBe(true);
    }
  });

  it("rejects non-uuid over_shepherd_id", () => {
    const r = validateAssignShepherdCoveragePayload({
      shepherd_profile_id: UUID_A,
      over_shepherd_id: "nope",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /over_shepherd_id/i.test(e))).toBe(true);
    }
  });

  it("rejects future assigned_at", () => {
    const r = validateAssignShepherdCoveragePayload(
      {
        shepherd_profile_id: UUID_A,
        over_shepherd_id: UUID_B,
        assigned_at: "2030-01-01",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /future/i.test(e))).toBe(true);
    }
  });

  it("accepts a happy-path assign without assigned_at", () => {
    const r = validateAssignShepherdCoveragePayload({
      shepherd_profile_id: UUID_A.toUpperCase(),
      over_shepherd_id: UUID_B.toUpperCase(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shepherd_profile_id).toBe(UUID_A);
      expect(r.value.over_shepherd_id).toBe(UUID_B);
      expect(r.value.assigned_at).toBeNull();
    }
  });

  it("accepts assigned_at on UTC today + 1 buffer", () => {
    const r = validateAssignShepherdCoveragePayload(
      {
        shepherd_profile_id: UUID_A,
        over_shepherd_id: UUID_B,
        assigned_at: "2026-05-22",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.assigned_at).toBe("2026-05-22");
  });

  it("does not enforce role gating — the RPC is the authoritative gate", () => {
    // The validator is shape-only. Any UUID pair is accepted at this
    // layer; the RPC verifies the shepherd_profile_id is an active
    // leader/co_leader and the over_shepherd_id is active.
    const r = validateAssignShepherdCoveragePayload({
      shepherd_profile_id: UUID_A,
      over_shepherd_id: UUID_B,
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateEndShepherdCoverageAssignmentPayload", () => {
  it("rejects non-uuid assignment_id", () => {
    const r = validateEndShepherdCoverageAssignmentPayload({
      assignment_id: "nope",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects future ended_at", () => {
    const r = validateEndShepherdCoverageAssignmentPayload(
      {
        assignment_id: UUID_A,
        ended_at: "2030-01-01",
      },
      { todayIso: "2026-05-21" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /future/i.test(e))).toBe(true);
    }
  });

  it("accepts a happy-path end without ended_at", () => {
    const r = validateEndShepherdCoverageAssignmentPayload({
      assignment_id: UUID_A.toUpperCase(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.assignment_id).toBe(UUID_A);
      expect(r.value.ended_at).toBeNull();
    }
  });

  it("rejects malformed ended_at", () => {
    const r = validateEndShepherdCoverageAssignmentPayload({
      assignment_id: UUID_A,
      ended_at: "not-a-date",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateLaunchPlanningAssumptionsPayload", () => {
  it("rejects non-object input", () => {
    expect(validateLaunchPlanningAssumptionsPayload(null).ok).toBe(false);
    expect(validateLaunchPlanningAssumptionsPayload("not an object").ok).toBe(false);
  });

  it("accepts the documented default payload", () => {
    const r = validateLaunchPlanningAssumptionsPayload({
      current_church_attendance: 100,
      expected_growth: 20,
      expected_growth_date: null,
      target_group_participation_pct: 0.6,
      average_group_size: 10,
      launch_buffer_pct: 0.15,
      leaders_per_new_group: 2,
      notes: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.current_church_attendance).toBe(100);
      expect(r.value.expected_growth).toBe(20);
      expect(r.value.expected_growth_date).toBeNull();
      expect(r.value.target_group_participation_pct).toBe(0.6);
      expect(r.value.average_group_size).toBe(10);
      expect(r.value.launch_buffer_pct).toBe(0.15);
      expect(r.value.leaders_per_new_group).toBe(2);
      expect(r.value.notes).toBeNull();
    }
  });

  it("rejects unknown top-level keys", () => {
    const r = validateLaunchPlanningAssumptionsPayload({
      current_church_attendance: 100,
      mystery_field: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /Unknown setting key/i.test(e))).toBe(true);
    }
  });

  it("rejects target_group_participation_pct outside 0–1", () => {
    expect(
      validateLaunchPlanningAssumptionsPayload({
        target_group_participation_pct: 1.2,
      }).ok,
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({
        target_group_participation_pct: -0.1,
      }).ok,
    ).toBe(false);
  });

  it("rejects launch_buffer_pct >= 1 to keep the (1 - buffer) denominator positive", () => {
    expect(
      validateLaunchPlanningAssumptionsPayload({ launch_buffer_pct: 1 }).ok,
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({ launch_buffer_pct: 0.96 }).ok,
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({ launch_buffer_pct: 0.95 }).ok,
    ).toBe(true);
  });

  it("rejects out-of-range integer fields", () => {
    expect(
      validateLaunchPlanningAssumptionsPayload({ current_church_attendance: -1 }).ok,
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({ average_group_size: 0 }).ok,
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({ leaders_per_new_group: 11 }).ok,
    ).toBe(false);
  });

  it("accepts and parses string-encoded form values", () => {
    const r = validateLaunchPlanningAssumptionsPayload({
      current_church_attendance: "120",
      expected_growth: "30",
      target_group_participation_pct: "0.7",
      launch_buffer_pct: "0.2",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.current_church_attendance).toBe(120);
      expect(r.value.expected_growth).toBe(30);
      expect(r.value.target_group_participation_pct).toBeCloseTo(0.7, 6);
      expect(r.value.launch_buffer_pct).toBeCloseTo(0.2, 6);
    }
  });

  it("accepts ISO calendar dates and rejects impossible ones", () => {
    const ok = validateLaunchPlanningAssumptionsPayload({
      expected_growth_date: "2026-08-01",
    });
    expect(ok.ok).toBe(true);
    const bad = validateLaunchPlanningAssumptionsPayload({
      expected_growth_date: "2026-02-30",
    });
    expect(bad.ok).toBe(false);
    const malformed = validateLaunchPlanningAssumptionsPayload({
      expected_growth_date: "next August",
    });
    expect(malformed.ok).toBe(false);
  });

  it("treats empty-string date and notes as null clears", () => {
    const r = validateLaunchPlanningAssumptionsPayload({
      expected_growth_date: "",
      notes: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.expected_growth_date).toBeNull();
      expect(r.value.notes).toBeNull();
    }
  });

  it("rejects notes longer than 2000 characters", () => {
    const r = validateLaunchPlanningAssumptionsPayload({
      notes: "x".repeat(2001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /2000 characters/i.test(e))).toBe(true);
    }
  });

  it("allows submitting a partial payload (PATCH semantics)", () => {
    const r = validateLaunchPlanningAssumptionsPayload({
      launch_buffer_pct: 0.1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.value)).toEqual(["launch_buffer_pct"]);
    }
  });
});

describe("validateCreateLaunchPlanningScenarioPayload", () => {
  it("requires a non-empty name", () => {
    const r = validateCreateLaunchPlanningScenarioPayload({
      name: "",
      assumptions: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /name is required/i.test(e))).toBe(true);
    }
  });

  it("trims whitespace from the name", () => {
    const r = validateCreateLaunchPlanningScenarioPayload({
      name: "  Conservative  ",
      assumptions: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.name).toBe("Conservative");
  });

  it("rejects names longer than 120 characters", () => {
    const r = validateCreateLaunchPlanningScenarioPayload({
      name: "x".repeat(121),
      assumptions: {},
    });
    expect(r.ok).toBe(false);
  });

  it("rejects descriptions longer than 1000 characters", () => {
    const r = validateCreateLaunchPlanningScenarioPayload({
      name: "Stretch",
      description: "y".repeat(1001),
      assumptions: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /1000 characters/i.test(e))).toBe(true);
    }
  });

  it("treats omitted description as null", () => {
    const r = validateCreateLaunchPlanningScenarioPayload({
      name: "Expected",
      assumptions: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.description).toBeNull();
  });

  it("bubbles assumption-validation errors into the scenario error list", () => {
    const r = validateCreateLaunchPlanningScenarioPayload({
      name: "Bad",
      assumptions: { target_group_participation_pct: 5 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /between 0 and 1/i.test(e))).toBe(true);
    }
  });

  it("captures the make_current flag from string form values", () => {
    const r = validateCreateLaunchPlanningScenarioPayload({
      name: "Conservative",
      assumptions: {},
      make_current: "true",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.make_current).toBe(true);
  });

  it("accepts a fully-specified assumptions payload", () => {
    const r = validateCreateLaunchPlanningScenarioPayload({
      name: "Stretch",
      description: "Aggressive growth scenario",
      make_current: true,
      assumptions: {
        current_church_attendance: "250",
        expected_growth: "60",
        expected_growth_date: "2026-08-01",
        target_group_participation_pct: "0.7",
        average_group_size: "12",
        launch_buffer_pct: "0.2",
        leaders_per_new_group: "2",
        notes: "Push to grow",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Stretch");
      expect(r.value.description).toBe("Aggressive growth scenario");
      expect(r.value.make_current).toBe(true);
      expect(r.value.assumptions.current_church_attendance).toBe(250);
      expect(r.value.assumptions.target_group_participation_pct).toBeCloseTo(
        0.7,
        6,
      );
    }
  });
});

describe("validateUpdateLaunchPlanningScenarioPayload", () => {
  it("requires a uuid scenario_id", () => {
    const r = validateUpdateLaunchPlanningScenarioPayload({
      scenario_id: "not-a-uuid",
      name: "Stretch",
      assumptions: {},
    });
    expect(r.ok).toBe(false);
  });

  it("lowercases the scenario_id", () => {
    const r = validateUpdateLaunchPlanningScenarioPayload({
      scenario_id: "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF",
      name: "Stretch",
      assumptions: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.scenario_id).toBe(
        "ffffffff-ffff-ffff-ffff-ffffffffffff",
      );
    }
  });
});

describe("validateScenarioIdPayload", () => {
  it("requires a uuid", () => {
    expect(validateScenarioIdPayload({ scenario_id: "abc" }).ok).toBe(false);
    expect(validateScenarioIdPayload(null).ok).toBe(false);
  });

  it("returns the lowercased uuid", () => {
    const r = validateScenarioIdPayload({
      scenario_id: UUID_A.toUpperCase(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.scenario_id).toBe(UUID_A);
  });
});

describe("validateMetricDefaultsPayload — shepherd_care_stale_days (Julian P1)", () => {
  it("accepts an in-range value", () => {
    const r = validateMetricDefaultsPayload({ shepherd_care_stale_days: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.shepherd_care_stale_days).toBe(30);
  });

  it("rejects values below 7 and above 365", () => {
    expect(validateMetricDefaultsPayload({ shepherd_care_stale_days: 6 }).ok).toBe(false);
    expect(validateMetricDefaultsPayload({ shepherd_care_stale_days: 366 }).ok).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(validateMetricDefaultsPayload({ shepherd_care_stale_days: "soon" }).ok).toBe(false);
  });

  it("accepts the 7 and 365 boundaries", () => {
    expect(validateMetricDefaultsPayload({ shepherd_care_stale_days: 7 }).ok).toBe(true);
    expect(validateMetricDefaultsPayload({ shepherd_care_stale_days: 365 }).ok).toBe(true);
  });
});

describe("validateRecordChurchAttendancePayload (Julian P2)", () => {
  it("accepts a valid date + count", () => {
    const r = validateRecordChurchAttendancePayload({
      snapshot_date: "2026-05-24",
      attendance_count: "100",
      note: "Sunday estimate",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.attendance_count).toBe(100);
      expect(r.value.snapshot_date).toBe("2026-05-24");
      expect(r.value.note).toBe("Sunday estimate");
    }
  });

  it("requires a well-formed date", () => {
    expect(
      validateRecordChurchAttendancePayload({
        snapshot_date: "May 24",
        attendance_count: 100,
      }).ok,
    ).toBe(false);
    expect(
      validateRecordChurchAttendancePayload({ attendance_count: 100 }).ok,
    ).toBe(false);
  });

  it("rejects a non-integer or out-of-range count", () => {
    expect(
      validateRecordChurchAttendancePayload({
        snapshot_date: "2026-05-24",
        attendance_count: "lots",
      }).ok,
    ).toBe(false);
    expect(
      validateRecordChurchAttendancePayload({
        snapshot_date: "2026-05-24",
        attendance_count: 1000001,
      }).ok,
    ).toBe(false);
  });

  it("treats a blank note as null", () => {
    const r = validateRecordChurchAttendancePayload({
      snapshot_date: "2026-05-24",
      attendance_count: 0,
      note: "   ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.note).toBeNull();
  });
});

describe("multiplication candidate payloads (Julian P4)", () => {
  it("accepts a valid create payload and defaults status to watching", () => {
    const r = validateCreateMultiplicationCandidatePayload({
      group_id: UUID_A,
      target_year: "2027",
      shepherd_willing: "on",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.group_id).toBe(UUID_A);
      expect(r.value.target_year).toBe(2027);
      expect(r.value.status).toBe("watching");
      expect(r.value.shepherd_willing).toBe(true);
      expect(r.value.needs_similar_stage).toBe(false);
    }
  });

  it("rejects a bad group id and out-of-range year", () => {
    expect(
      validateCreateMultiplicationCandidatePayload({ group_id: "nope" }).ok,
    ).toBe(false);
    expect(
      validateCreateMultiplicationCandidatePayload({
        group_id: UUID_A,
        target_year: "1999",
      }).ok,
    ).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(
      validateUpdateMultiplicationCandidatePayload({
        candidate_id: UUID_A,
        status: "maybe",
      }).ok,
    ).toBe(false);
  });

  it("accepts a valid update payload", () => {
    const r = validateUpdateMultiplicationCandidatePayload({
      candidate_id: UUID_A,
      status: "planned",
      target_year: "2026",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.status).toBe("planned");
      expect(r.value.candidate_id).toBe(UUID_A);
    }
  });
});
