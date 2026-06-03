import { describe, expect, it } from "vitest";

import {
  parseStoredPreference,
  serializePreference,
  viewPreferenceKey,
} from "../view-preferences";

// Pure core of the per-user "saved views & filters" persistence (PRD req 12,
// #263). These cover the parts the React hook leans on: per-user key scoping
// and the safe parse that protects the UI from corrupt or stale stored values.

describe("viewPreferenceKey", () => {
  it("scopes the key to the surface and the signed-in profile id", () => {
    expect(viewPreferenceKey("calendar", "user-123")).toBe(
      "lg:admin-view:user-123:calendar"
    );
    expect(viewPreferenceKey("follow-ups", "user-123")).toBe(
      "lg:admin-view:user-123:follow-ups"
    );
  });

  it("keeps two users on the same surface in separate buckets", () => {
    expect(viewPreferenceKey("calendar", "a")).not.toBe(
      viewPreferenceKey("calendar", "b")
    );
  });

  it("falls back to a shared 'anon' bucket without an identity", () => {
    expect(viewPreferenceKey("calendar", null)).toBe(
      "lg:admin-view:anon:calendar"
    );
    expect(viewPreferenceKey("calendar", undefined)).toBe(
      "lg:admin-view:anon:calendar"
    );
    expect(viewPreferenceKey("calendar", "")).toBe(
      "lg:admin-view:anon:calendar"
    );
  });
});

describe("parseStoredPreference", () => {
  const isFilter = (v: unknown): v is "all" | "watch" =>
    v === "all" || v === "watch";

  it("returns null for a missing value", () => {
    expect(parseStoredPreference(null, isFilter)).toBeNull();
  });

  it("returns null for unparseable JSON", () => {
    expect(parseStoredPreference("{not json", isFilter)).toBeNull();
  });

  it("returns null when the parsed value fails the validator (stale shape)", () => {
    expect(
      parseStoredPreference(JSON.stringify("removed"), isFilter)
    ).toBeNull();
    expect(
      parseStoredPreference(JSON.stringify({ a: 1 }), isFilter)
    ).toBeNull();
  });

  it("returns the parsed value when it passes the validator", () => {
    expect(parseStoredPreference(JSON.stringify("watch"), isFilter)).toBe(
      "watch"
    );
  });

  it("round-trips a serialized object snapshot", () => {
    type Snap = { viewMode: "month" | "list"; days: number[] };
    const isSnap = (v: unknown): v is Snap =>
      typeof v === "object" &&
      v !== null &&
      ((v as Snap).viewMode === "month" || (v as Snap).viewMode === "list") &&
      Array.isArray((v as Snap).days);

    const snap: Snap = { viewMode: "list", days: [1, 3] };
    const restored = parseStoredPreference(serializePreference(snap), isSnap);
    expect(restored).toEqual(snap);
  });
});
