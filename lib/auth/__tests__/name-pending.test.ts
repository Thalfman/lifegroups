import { describe, expect, it } from "vitest";

import { namePendingRedirectTarget } from "@/lib/auth/name-pending";
import type { SessionResult } from "@/lib/auth/session";
import type { ProfilesRow } from "@/types/database";

const PROFILE: ProfilesRow = {
  id: "11111111-1111-1111-1111-111111111111",
  auth_user_id: "33333333-3333-3333-3333-333333333333",
  full_name: "leader@example.com",
  full_name_pending: true,
  email: "leader@example.com",
  phone: null,
  role: "leader",
  status: "active",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function authenticated(overrides: Partial<ProfilesRow> = {}): SessionResult {
  return {
    kind: "authenticated",
    authUser: { id: PROFILE.auth_user_id!, email: PROFILE.email },
    profile: { ...PROFILE, ...overrides },
    assignedGroupIds: [],
  };
}

describe("namePendingRedirectTarget", () => {
  it("sends an authenticated pending-name session to /welcome", () => {
    expect(namePendingRedirectTarget(authenticated())).toBe("/welcome");
  });

  it("passes an authenticated session whose name is chosen", () => {
    expect(
      namePendingRedirectTarget(authenticated({ full_name_pending: false }))
    ).toBeNull();
  });

  it("never gates non-authenticated sessions", () => {
    const sessions: SessionResult[] = [
      { kind: "anonymous" },
      {
        kind: "profile_missing",
        authUser: { id: PROFILE.auth_user_id!, email: PROFILE.email },
      },
      { kind: "backend_error", stage: "profile_lookup", message: "boom" },
    ];
    for (const session of sessions) {
      expect(namePendingRedirectTarget(session)).toBeNull();
    }
  });
});
