import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockWarn } = vi.hoisted(() => ({ mockWarn: vi.fn() }));

vi.mock("../logger", () => ({
  log: { info: vi.fn(), warn: mockWarn, error: vi.fn() },
}));

import { hashEmail, newCorrelationId } from "../identifiers";

const ORIGINAL_SALT = process.env.LOG_HASH_SALT;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (ORIGINAL_SALT === undefined) delete process.env.LOG_HASH_SALT;
  else process.env.LOG_HASH_SALT = ORIGINAL_SALT;
});

describe("newCorrelationId", () => {
  it("returns a unique UUID per call", () => {
    const a = newCorrelationId();
    const b = newCorrelationId();
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(a).not.toBe(b);
  });
});

describe("hashEmail", () => {
  it("derives a stable, fixed-length, non-reversible digest, normalizing case and whitespace", async () => {
    process.env.LOG_HASH_SALT = "pepper";
    const a = await hashEmail("Person@Example.com");
    const b = await hashEmail("  person@example.com  ");

    expect(a).toBe(b); // case + trim normalized
    expect(a).toHaveLength(12);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(a).not.toContain("person"); // not the raw address
  });

  it("changes with the salt (rotating the salt invalidates correlation)", async () => {
    process.env.LOG_HASH_SALT = "salt-one";
    const one = await hashEmail("a@b.com");
    process.env.LOG_HASH_SALT = "salt-two";
    const two = await hashEmail("a@b.com");
    expect(one).not.toBe(two);
  });

  it("warns exactly once when the salt is unset (so the gap is visible in logs)", async () => {
    delete process.env.LOG_HASH_SALT;
    await hashEmail("a@b.com");
    await hashEmail("c@d.com");
    // The module-level once-guard fires the warn on the FIRST unsalted call
    // only (earlier tests in this file used a salt, so the guard was still
    // armed); the second unsalted call must stay silent.
    const saltWarnings = mockWarn.mock.calls.filter(
      (c) => c[0]?.event === "log_hash_salt_missing"
    );
    expect(saltWarnings.length).toBe(1);
  });
});
