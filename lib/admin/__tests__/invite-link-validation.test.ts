import { describe, expect, it } from "vitest";
import {
  validateCreateInviteLinkPayload,
  MAX_EXPIRY_MS,
} from "@/lib/admin/validation";

const UUID_A = "11111111-1111-1111-1111-111111111111";

describe("validateCreateInviteLinkPayload", () => {
  it("accepts a leader link with a preset expiry and resolves an ISO timestamp", () => {
    const r = validateCreateInviteLinkPayload({
      role: "leader",
      expiry_preset: "7d",
      single_use: "true",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.role).toBe("leader");
      expect(r.value.single_use).toBe(true);
      const ms = Date.parse(r.value.expires_at);
      expect(Number.isNaN(ms)).toBe(false);
      // ~7 days out, within a generous window.
      expect(ms).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
      expect(ms).toBeLessThan(Date.now() + 8 * 24 * 60 * 60 * 1000);
    }
  });

  it("rejects super_admin as an assignable role", () => {
    const r = validateCreateInviteLinkPayload({
      role: "super_admin",
      expiry_preset: "24h",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /Role must be/i.test(e))).toBe(true);
    }
  });

  it("rejects a group assignment on a non-leader role", () => {
    const r = validateCreateInviteLinkPayload({
      role: "ministry_admin",
      group_id: UUID_A,
      expiry_preset: "24h",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /shepherds and co-shepherds/i.test(e))).toBe(
        true
      );
    }
  });

  it("keeps a group assignment for co_leader", () => {
    const r = validateCreateInviteLinkPayload({
      role: "co_leader",
      group_id: UUID_A,
      expiry_preset: "30d",
      single_use: "false",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.group_id).toBe(UUID_A);
      expect(r.value.single_use).toBe(false);
    }
  });

  it("requires a custom expiry value when the custom preset is chosen", () => {
    const r = validateCreateInviteLinkPayload({
      role: "leader",
      expiry_preset: "custom",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /custom expiry/i.test(e))).toBe(true);
    }
  });

  it("accepts a future custom expiry", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const r = validateCreateInviteLinkPayload({
      role: "leader",
      expiry_preset: "custom",
      expires_at: future,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a custom expiry in the past", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const r = validateCreateInviteLinkPayload({
      role: "leader",
      expiry_preset: "custom",
      expires_at: past,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /future/i.test(e))).toBe(true);
    }
  });

  it("rejects a custom expiry beyond the 90-day ceiling", () => {
    const tooFar = new Date(
      Date.now() + MAX_EXPIRY_MS + 86_400_000
    ).toISOString();
    const r = validateCreateInviteLinkPayload({
      role: "leader",
      expiry_preset: "custom",
      expires_at: tooFar,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /90 days/i.test(e))).toBe(true);
    }
  });

  it("rejects a missing / unknown expiry preset", () => {
    const r = validateCreateInviteLinkPayload({ role: "leader" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /when the link should expire/i.test(e))).toBe(
        true
      );
    }
  });
});
