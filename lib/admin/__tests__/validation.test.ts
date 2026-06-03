import { describe, expect, it } from "vitest";
import {
  guardAgainstSelfRoleChange,
  guardAgainstSelfTarget,
  guardAgainstSuperAdminAssignment,
  validateAssignLeaderToGroupPayload,
  validateAssignShepherdCoveragePayload,
  validateChangeUserRolePayload,
  validateCreateLaunchPlanningScenarioPayload,
  validateCreateOverShepherdPayload,
  validateCreateShepherdCareFollowUpPayload,
  validateEndShepherdCoverageAssignmentPayload,
  validateInviteUserPayload,
  validateLaunchPlanningAssumptionsPayload,
  validateCreateMultiplicationCandidatePayload,
  validateLogShepherdCareInteractionPayload,
  validateOverShepherdBroadNotePayload,
  validateGroupHealthRatingsPayload,
  validateMetricDefaultsPayload,
  validatePlatformConfigPayload,
  validateRecordChurchAttendancePayload,
  validateScenarioIdPayload,
  validateSetGroupCapacityTargetPayload,
  validateUpdateMultiplicationCandidatePayload,
  validateUpdateLaunchPlanningScenarioPayload,
  validateUpdateOverShepherdPayload,
  validateUpdateShepherdCareFollowUpPayload,
  validateUpdateShepherdCareFollowUpStatusPayload,
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

  it("rejects an unknown / retired role as an assignable role", () => {
    const r = validateInviteUserPayload({
      full_name: "X",
      email: "x@example.com",
      role: "retired_role",
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
        r.errors.some((e) =>
          /ministry admins are not assigned to a group/i.test(e)
        )
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

  // Over-Shepherd is invitable so the coach login tier can be provisioned from
  // the app (docs/adr/0002-oversight-ladder-and-leader-gating.md, Codex #3).
  it("accepts an over_shepherd invite (no group assignment)", () => {
    const r = validateInviteUserPayload({
      full_name: "Coach Casey",
      email: "casey@example.com",
      role: "over_shepherd",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.role).toBe("over_shepherd");
      expect(r.value.group_id).toBeUndefined();
    }
  });

  it("rejects over_shepherd paired with a group_id (coaches lead no group)", () => {
    const r = validateInviteUserPayload({
      full_name: "Coach Casey",
      email: "casey@example.com",
      role: "over_shepherd",
      group_id: UUID_A,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) =>
          /over-shepherds are not assigned to a group/i.test(e)
        )
      ).toBe(true);
    }
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

  // Converting an existing profile into the coach login tier (Codex #3); the
  // over_shepherd value is a valid user_role and is not one of the guarded
  // targets (super_admin).
  it("accepts over_shepherd as a role-change target", () => {
    const r = validateChangeUserRolePayload({
      profile_id: UUID_A,
      new_role: "over_shepherd",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.new_role).toBe("over_shepherd");
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
        { profile_id: UUID_A, new_role: "ministry_admin" }
      )
    ).not.toBeNull();
    expect(
      guardAgainstSelfRoleChange(
        { id: UUID_A, role: "super_admin" },
        { profile_id: UUID_B, new_role: "ministry_admin" }
      )
    ).toBeNull();
  });

  it("guardAgainstSuperAdminAssignment blocks super_admin assignments", () => {
    expect(
      guardAgainstSuperAdminAssignment({
        profile_id: UUID_A,
        new_role: "super_admin",
      })
    ).not.toBeNull();
    expect(
      guardAgainstSuperAdminAssignment({
        profile_id: UUID_A,
        new_role: "ministry_admin",
      })
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
      current_status: "doing_well",
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
      current_status: "needs_encouragement",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shepherd_profile_id).toBe(UUID_A);
      expect(r.value.set_current_status).toBe(true);
      expect(r.value.current_status).toBe("needs_encouragement");
      expect(r.value.set_next_touchpoint_due).toBe(false);
      expect(r.value.set_admin_summary).toBe(false);
    }
  });
});

describe("validateGroupHealthRatingsPayload", () => {
  it("rejects a non-uuid group_id", () => {
    const r = validateGroupHealthRatingsPayload({
      group_id: "nope",
      spiritual_growth_score: "4",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects an all-empty submit (no ratings, no note)", () => {
    const r = validateGroupHealthRatingsPayload({ group_id: UUID_A });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /at least one/i.test(e))).toBe(true);
    }
  });

  it("rejects an out-of-range rating", () => {
    const r = validateGroupHealthRatingsPayload({
      group_id: UUID_A,
      spiritual_growth_score: "6",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /between 1 and 5/i.test(e))).toBe(true);
    }
  });

  it("rejects an oversized spiritual-growth note", () => {
    const r = validateGroupHealthRatingsPayload({
      group_id: UUID_A,
      spiritual_growth_score: "3",
      spiritual_growth_note: "a".repeat(2001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /too long/i.test(e))).toBe(true);
    }
  });

  it("accepts both ratings + note and canonicalizes the uuid", () => {
    const r = validateGroupHealthRatingsPayload({
      group_id: UUID_A.toUpperCase(),
      spiritual_growth_score: "4",
      spiritual_growth_note: "  steady growth  ",
      group_question_score: "3",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.group_id).toBe(UUID_A);
      expect(r.value.spiritual_growth_score).toBe(4);
      expect(r.value.spiritual_growth_note).toBe("steady growth");
      expect(r.value.group_question_score).toBe(3);
    }
  });

  it("treats an empty score as an explicit clear (null) while the other stands", () => {
    const r = validateGroupHealthRatingsPayload({
      group_id: UUID_A,
      spiritual_growth_score: "4",
      group_question_score: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.spiritual_growth_score).toBe(4);
      expect(r.value.group_question_score).toBeNull();
    }
  });

  it("defaults the follow-up flag to false when absent", () => {
    const r = validateGroupHealthRatingsPayload({
      group_id: UUID_A,
      spiritual_growth_score: "4",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.needs_follow_up).toBe(false);
  });

  it("reads the follow-up flag from the checkbox 'on' value", () => {
    const r = validateGroupHealthRatingsPayload({
      group_id: UUID_A,
      spiritual_growth_score: "4",
      needs_follow_up: "on",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.needs_follow_up).toBe(true);
  });

  it("accepts a flag-only submit (setting needs_follow_up is content worth persisting)", () => {
    const r = validateGroupHealthRatingsPayload({
      group_id: UUID_A,
      needs_follow_up: "on",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.needs_follow_up).toBe(true);
  });

  it("rejects a real-form no-op: no ratings, no note, follow-up unchecked", () => {
    // The action runner lifts needs_follow_up into the payload even when the
    // checkbox is unchecked (value undefined). The guard must key on the flag's
    // VALUE, not its presence, or it never fires for a real drawer save.
    const r = validateGroupHealthRatingsPayload({
      group_id: UUID_A,
      needs_follow_up: undefined,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /at least one/i.test(e))).toBe(true);
    }
  });

  it("still rejects a bare object with no ratings, note, or follow-up flag", () => {
    const r = validateGroupHealthRatingsPayload({ group_id: UUID_A });
    expect(r.ok).toBe(false);
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
      { todayIso: "2026-05-21" }
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
      { todayIso: "2026-05-21" }
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
      { todayIso: "2026-05-21" }
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
      { todayIso: "2026-05-21" }
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
      { todayIso: "2026-05-21" }
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
      { todayIso: "2026-05-21" }
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
        current_status: "needs_follow_up",
      },
      { todayIso: "2026-05-21" }
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.set_next_touchpoint_due).toBe(true);
      expect(r.value.next_touchpoint_due).toBe("2026-06-05");
      expect(r.value.set_current_status).toBe(true);
      expect(r.value.current_status).toBe("needs_follow_up");
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
      { todayIso: "2026-05-21" }
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
      { todayIso: "2026-05-21" }
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
      { todayIso: "2026-05-21" }
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
    expect(validateLaunchPlanningAssumptionsPayload("not an object").ok).toBe(
      false
    );
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
      }).ok
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({
        target_group_participation_pct: -0.1,
      }).ok
    ).toBe(false);
  });

  it("rejects launch_buffer_pct >= 1 to keep the (1 - buffer) denominator positive", () => {
    expect(
      validateLaunchPlanningAssumptionsPayload({ launch_buffer_pct: 1 }).ok
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({ launch_buffer_pct: 0.96 }).ok
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({ launch_buffer_pct: 0.95 }).ok
    ).toBe(true);
  });

  it("rejects out-of-range integer fields", () => {
    expect(
      validateLaunchPlanningAssumptionsPayload({
        current_church_attendance: -1,
      }).ok
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({ average_group_size: 0 }).ok
    ).toBe(false);
    expect(
      validateLaunchPlanningAssumptionsPayload({ leaders_per_new_group: 11 }).ok
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
        6
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
      expect(r.value.scenario_id).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");
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

describe("validateMetricDefaultsPayload — per-tier stale windows (Julian Q5)", () => {
  it("accepts in-range values for both tier windows", () => {
    const r = validateMetricDefaultsPayload({
      shepherd_care_stale_days_direct: 30,
      shepherd_care_stale_days_delegated: 60,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shepherd_care_stale_days_direct).toBe(30);
      expect(r.value.shepherd_care_stale_days_delegated).toBe(60);
    }
  });

  it("rejects values below 7 and above 365 on either tier", () => {
    expect(
      validateMetricDefaultsPayload({ shepherd_care_stale_days_direct: 6 }).ok
    ).toBe(false);
    expect(
      validateMetricDefaultsPayload({ shepherd_care_stale_days_direct: 366 }).ok
    ).toBe(false);
    expect(
      validateMetricDefaultsPayload({ shepherd_care_stale_days_delegated: 6 })
        .ok
    ).toBe(false);
    expect(
      validateMetricDefaultsPayload({ shepherd_care_stale_days_delegated: 366 })
        .ok
    ).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(
      validateMetricDefaultsPayload({ shepherd_care_stale_days_direct: "soon" })
        .ok
    ).toBe(false);
    expect(
      validateMetricDefaultsPayload({
        shepherd_care_stale_days_delegated: "soon",
      }).ok
    ).toBe(false);
  });

  it("accepts the 7 and 365 boundaries", () => {
    expect(
      validateMetricDefaultsPayload({ shepherd_care_stale_days_direct: 7 }).ok
    ).toBe(true);
    expect(
      validateMetricDefaultsPayload({ shepherd_care_stale_days_delegated: 365 })
        .ok
    ).toBe(true);
  });

  it("rejects the superseded single key as unknown", () => {
    expect(
      validateMetricDefaultsPayload({ shepherd_care_stale_days: 30 }).ok
    ).toBe(false);
  });
});

describe("validateMetricDefaultsPayload — Group-health triage thresholds (#265)", () => {
  it("accepts an A–D Watch grade and an in-range decline margin", () => {
    const r = validateMetricDefaultsPayload({
      group_health_watch_grade: "B",
      group_health_attendance_decline_margin_pct: 15,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.group_health_watch_grade).toBe("B");
      expect(r.value.group_health_attendance_decline_margin_pct).toBe(15);
    }
  });

  it("rejects a Watch grade outside A–D", () => {
    expect(
      validateMetricDefaultsPayload({ group_health_watch_grade: "F" }).ok
    ).toBe(false);
    expect(
      validateMetricDefaultsPayload({ group_health_watch_grade: "c" }).ok
    ).toBe(false);
  });

  it("rejects a decline margin outside 0–100 or non-integer", () => {
    expect(
      validateMetricDefaultsPayload({
        group_health_attendance_decline_margin_pct: 101,
      }).ok
    ).toBe(false);
    expect(
      validateMetricDefaultsPayload({
        group_health_attendance_decline_margin_pct: -1,
      }).ok
    ).toBe(false);
    expect(
      validateMetricDefaultsPayload({
        group_health_attendance_decline_margin_pct: "lots",
      }).ok
    ).toBe(false);
  });

  it("accepts the 0 and 100 margin boundaries", () => {
    expect(
      validateMetricDefaultsPayload({
        group_health_attendance_decline_margin_pct: 0,
      }).ok
    ).toBe(true);
    expect(
      validateMetricDefaultsPayload({
        group_health_attendance_decline_margin_pct: 100,
      }).ok
    ).toBe(true);
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
      }).ok
    ).toBe(false);
    expect(
      validateRecordChurchAttendancePayload({ attendance_count: 100 }).ok
    ).toBe(false);
  });

  it("rejects a non-integer or out-of-range count", () => {
    expect(
      validateRecordChurchAttendancePayload({
        snapshot_date: "2026-05-24",
        attendance_count: "lots",
      }).ok
    ).toBe(false);
    expect(
      validateRecordChurchAttendancePayload({
        snapshot_date: "2026-05-24",
        attendance_count: 1000001,
      }).ok
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
      validateCreateMultiplicationCandidatePayload({ group_id: "nope" }).ok
    ).toBe(false);
    expect(
      validateCreateMultiplicationCandidatePayload({
        group_id: UUID_A,
        target_year: "1999",
      }).ok
    ).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(
      validateUpdateMultiplicationCandidatePayload({
        candidate_id: UUID_A,
        status: "maybe",
      }).ok
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

  // Julian #143: successor/leader-designate + meeting-time fields.
  it("round-trips a successor/leader-designate, defaulting it to null when absent", () => {
    const present = validateCreateMultiplicationCandidatePayload({
      group_id: UUID_A,
      successor_designate: "  Tony L.  ",
    });
    expect(present.ok).toBe(true);
    if (present.ok) expect(present.value.successor_designate).toBe("Tony L.");

    const absent = validateCreateMultiplicationCandidatePayload({
      group_id: UUID_A,
    });
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.value.successor_designate).toBeNull();
  });

  it("rejects a successor/leader-designate longer than the text-field bound", () => {
    const r = validateUpdateMultiplicationCandidatePayload({
      candidate_id: UUID_A,
      successor_designate: "x".repeat(121),
    });
    expect(r.ok).toBe(false);
  });

  it("accepts both meeting-time values and defaults to null when absent", () => {
    for (const meeting_time of ["during_the_day", "evening"] as const) {
      const r = validateCreateMultiplicationCandidatePayload({
        group_id: UUID_A,
        meeting_time,
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.meeting_time).toBe(meeting_time);
    }
    const absent = validateCreateMultiplicationCandidatePayload({
      group_id: UUID_A,
    });
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.value.meeting_time).toBeNull();
  });

  it("rejects a meeting-time outside the allowed values", () => {
    const r = validateCreateMultiplicationCandidatePayload({
      group_id: UUID_A,
      meeting_time: "midnight",
    });
    expect(r.ok).toBe(false);
  });

  // Capacity & Multiplication #184: the apprentice link.
  it("round-trips a leader_pipeline_id, defaulting to null when absent or blank", () => {
    const present = validateCreateMultiplicationCandidatePayload({
      group_id: UUID_A,
      leader_pipeline_id: UUID_B,
    });
    expect(present.ok).toBe(true);
    if (present.ok) expect(present.value.leader_pipeline_id).toBe(UUID_B);

    const absent = validateCreateMultiplicationCandidatePayload({
      group_id: UUID_A,
    });
    expect(absent.ok).toBe(true);
    if (absent.ok) expect(absent.value.leader_pipeline_id).toBeNull();
  });

  it("rejects a non-uuid leader_pipeline_id", () => {
    const r = validateUpdateMultiplicationCandidatePayload({
      candidate_id: UUID_A,
      leader_pipeline_id: "not-a-uuid",
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateCreateShepherdCareFollowUpPayload", () => {
  it("accepts a title-only follow-up and defaults due/notes to null", () => {
    const r = validateCreateShepherdCareFollowUpPayload({
      care_profile_id: UUID_A,
      title: "  Check in next week  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("Check in next week");
      expect(r.value.due_date).toBeNull();
      expect(r.value.notes).toBeNull();
      expect(r.value.care_profile_id).toBe(UUID_A);
    }
  });

  it("requires a care_profile_id uuid and a non-empty title", () => {
    const r = validateCreateShepherdCareFollowUpPayload({
      care_profile_id: "not-a-uuid",
      title: "   ",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("care_profile_id must be a uuid");
      expect(r.errors).toContain("Title is required.");
    }
  });

  it("rejects a malformed due date and an over-long title", () => {
    const r = validateCreateShepherdCareFollowUpPayload({
      care_profile_id: UUID_A,
      title: "x".repeat(201),
      due_date: "05/01/2026",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("Title is too long (max 200 characters).");
      expect(r.errors).toContain("Due date must be YYYY-MM-DD.");
    }
  });
});

describe("validateUpdateShepherdCareFollowUpStatusPayload", () => {
  it("accepts the three legal statuses", () => {
    for (const status of ["open", "in_progress", "done"] as const) {
      const r = validateUpdateShepherdCareFollowUpStatusPayload({
        follow_up_id: UUID_A,
        status,
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.status).toBe(status);
    }
  });

  it("rejects an unknown status value and a bad id", () => {
    const r = validateUpdateShepherdCareFollowUpStatusPayload({
      follow_up_id: "nope",
      status: "snoozed",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("follow_up_id must be a uuid");
      expect(r.errors).toContain("Status must be open, in_progress, or done.");
    }
  });
});

describe("validateUpdateShepherdCareFollowUpPayload", () => {
  it("only carries due/notes through when their _set_ flag is true", () => {
    const r = validateUpdateShepherdCareFollowUpPayload({
      follow_up_id: UUID_A,
      title: "Updated title",
      set_due_date: "true",
      due_date: "2026-06-01",
      // set_notes omitted -> notes not applied
      notes: "ignored",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.set_due_date).toBe(true);
      expect(r.value.due_date).toBe("2026-06-01");
      expect(r.value.set_notes).toBe(false);
      expect(r.value.notes).toBeNull();
    }
  });

  it("requires a title and validates a set due date", () => {
    const r = validateUpdateShepherdCareFollowUpPayload({
      follow_up_id: UUID_A,
      title: "",
      set_due_date: "true",
      due_date: "bad",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toContain("Title is required.");
      expect(r.errors).toContain("Due date must be YYYY-MM-DD.");
    }
  });
});

describe("validateOverShepherdBroadNotePayload (#126)", () => {
  it("accepts a uuid + non-empty note and canonicalizes the uuid", () => {
    const r = validateOverShepherdBroadNotePayload({
      shepherd_profile_id: UUID_A.toUpperCase(),
      note: "  Checked in — doing well.  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.shepherd_profile_id).toBe(UUID_A);
      expect(r.value.note).toBe("Checked in — doing well.");
    }
  });

  it("rejects a non-uuid shepherd_profile_id", () => {
    const r = validateOverShepherdBroadNotePayload({
      shepherd_profile_id: "nope",
      note: "hi",
    });
    expect(r.ok).toBe(false);
  });

  it("requires a non-empty note", () => {
    for (const note of [undefined, "", "   "]) {
      const r = validateOverShepherdBroadNotePayload({
        shepherd_profile_id: UUID_A,
        note,
      });
      expect(r.ok).toBe(false);
      if (!r.ok)
        expect(r.errors.some((e) => /broad note is required/i.test(e))).toBe(
          true
        );
    }
  });

  it("rejects an oversized note", () => {
    const r = validateOverShepherdBroadNotePayload({
      shepherd_profile_id: UUID_A,
      note: "a".repeat(2001),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => /too long/i.test(e))).toBe(true);
  });
});

describe("validatePlatformConfigPayload", () => {
  it("accepts a tracer note string", () => {
    const r = validatePlatformConfigPayload({
      console_tracer_note: "launch soon",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.console_tracer_note).toBe("launch soon");
  });

  it("treats a missing field as a cleared (empty) note", () => {
    const r = validatePlatformConfigPayload({});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.console_tracer_note).toBe("");
  });

  it("rejects a non-string note", () => {
    const r = validatePlatformConfigPayload({ console_tracer_note: 7 });
    expect(r.ok).toBe(false);
  });

  it("rejects an oversized note", () => {
    const r = validatePlatformConfigPayload({
      console_tracer_note: "a".repeat(201),
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.errors.some((e) => /characters or fewer/i.test(e))).toBe(true);
  });

  it("rejects a non-object payload", () => {
    expect(validatePlatformConfigPayload(null).ok).toBe(false);
    expect(validatePlatformConfigPayload("nope").ok).toBe(false);
  });
});

describe("validateSetGroupCapacityTargetPayload (Capacity & Multiplication #185)", () => {
  it("accepts a whole-number target in range", () => {
    const r = validateSetGroupCapacityTargetPayload({
      group_id: UUID_A,
      target: "12",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.target).toBe(12);
  });

  it("treats a blank/absent target as a clear (null)", () => {
    const r = validateSetGroupCapacityTargetPayload({ group_id: UUID_A });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.target).toBeNull();
  });

  it("rejects a bad group id or out-of-range target", () => {
    expect(
      validateSetGroupCapacityTargetPayload({ group_id: "nope", target: "12" })
        .ok
    ).toBe(false);
    expect(
      validateSetGroupCapacityTargetPayload({ group_id: UUID_A, target: "0" })
        .ok
    ).toBe(false);
    expect(
      validateSetGroupCapacityTargetPayload({ group_id: UUID_A, target: "501" })
        .ok
    ).toBe(false);
  });
});
