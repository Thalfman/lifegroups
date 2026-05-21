import { describe, expect, it } from "vitest";
import {
  guardAgainstSelfRoleChange,
  guardAgainstSelfTarget,
  guardAgainstStaffViewerAssignment,
  guardAgainstSuperAdminAssignment,
  validateAssignLeaderToGroupPayload,
  validateChangeUserRolePayload,
  validateInviteUserPayload,
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
