import { describe, expect, it } from "vitest";

import {
  resolveAttentionBaseline,
  buildSurfaceBaselines,
  type AttentionResetBaselineRowLike,
} from "@/lib/admin/attention-reset";
import {
  detectCareReasons,
  needsAttentionFromReasons,
  type CareAttentionRow,
} from "@/lib/admin/shepherd-care-attention";
import { isCareContactStale } from "@/lib/admin/shepherd-care-cadence";

// health-checks-reset: the reset baseline is the mechanism that makes the two
// duration-derived "Needs attention" cards genuinely clear (not just hide). The
// pure resolver, the row splitter, and the two care predicates carry that
// behaviour, so they are pinned here without a DB.

describe("resolveAttentionBaseline", () => {
  it("returns the later of the entity override and the global baseline", () => {
    const baselines = {
      global: "2026-06-01",
      byEntityId: new Map([["leader-1", "2026-06-05"]]),
    };
    // Entity is newer → entity wins.
    expect(resolveAttentionBaseline(baselines, "leader-1")).toBe("2026-06-05");
    // No entity row → global.
    expect(resolveAttentionBaseline(baselines, "leader-2")).toBe("2026-06-01");
  });

  it("lets a newer global reset override a stale entity baseline", () => {
    // A fresh whole-queue reset (global) must clear an entity that carries an
    // older per-entity reset — otherwise the stale override would shadow it.
    const baselines = {
      global: "2026-06-10",
      byEntityId: new Map([["leader-1", "2026-05-01"]]),
    };
    expect(resolveAttentionBaseline(baselines, "leader-1")).toBe("2026-06-10");
  });

  it("returns null when neither baseline is set", () => {
    expect(
      resolveAttentionBaseline({ global: null, byEntityId: new Map() }, "x")
    ).toBeNull();
    expect(resolveAttentionBaseline(null, "x")).toBeNull();
    expect(resolveAttentionBaseline(undefined, "x")).toBeNull();
  });
});

describe("buildSurfaceBaselines", () => {
  const rows: AttentionResetBaselineRowLike[] = [
    {
      surface: "care",
      scope: "global",
      entity_id: null,
      baseline_on: "2026-06-01",
    },
    {
      surface: "care",
      scope: "entity",
      entity_id: "leader-1",
      baseline_on: "2026-06-05",
    },
    {
      surface: "health",
      scope: "global",
      entity_id: null,
      baseline_on: "2026-06-03",
    },
    {
      surface: "health",
      scope: "entity",
      entity_id: "group-1",
      baseline_on: "2026-06-04",
    },
    // Malformed rows are skipped, not trusted.
    {
      surface: "care",
      scope: "global",
      entity_id: "stray",
      baseline_on: "2026-01-01",
    },
    {
      surface: "care",
      scope: "entity",
      entity_id: null,
      baseline_on: "2026-01-01",
    },
  ];

  it("splits care rows by scope, passing the date through unchanged", () => {
    const care = buildSurfaceBaselines(rows, "care");
    expect(care.global).toBe("2026-06-01");
    expect(care.byEntityId.get("leader-1")).toBe("2026-06-05");
    // A health row never leaks into the care maps.
    expect(care.byEntityId.has("group-1")).toBe(false);
  });

  it("maps the health date (e.g. to a week-start) via mapDate", () => {
    const health = buildSurfaceBaselines(rows, "health", () => "2026-06-01");
    expect(health.global).toBe("2026-06-01");
    expect(health.byEntityId.get("group-1")).toBe("2026-06-01");
  });

  it("skips a global row carrying an entity id and an entity row with none", () => {
    const care = buildSurfaceBaselines(rows, "care");
    // The malformed global-with-entity didn't overwrite the real global.
    expect(care.global).toBe("2026-06-01");
    // The malformed entity-with-null id added no entry.
    expect(care.byEntityId.size).toBe(1);
  });
});

describe("detectCareReasons — reset baseline", () => {
  const TODAY = "2026-06-05";
  const STALE = 30;

  function reasons(care: CareAttentionRow | null, baselineIso: string | null) {
    return detectCareReasons(care, {
      todayIso: TODAY,
      staleDays: STALE,
      baselineIso,
    });
  }

  it("suppresses no_contact_yet when a baseline is present (no real contact)", () => {
    const never: CareAttentionRow = {
      current_status: "doing_well",
      last_contact_at: null,
      next_touchpoint_due: null,
    };
    expect(reasons(never, null)).toContain("no_contact_yet");
    // A recent baseline floors the contact date, so the leader reads fresh.
    expect(reasons(never, "2026-06-01")).not.toContain("no_contact_yet");
    expect(reasons(never, "2026-06-01")).not.toContain("stale_last_contact");
    // care === null + baseline is also suppressed.
    expect(reasons(null, "2026-06-01")).not.toContain("no_contact_yet");
  });

  it("measures staleness from the later of last contact and baseline", () => {
    const old: CareAttentionRow = {
      current_status: "doing_well",
      last_contact_at: "2026-01-01", // long ago → stale on its own
      next_touchpoint_due: null,
    };
    expect(reasons(old, null)).toContain("stale_last_contact");
    // A baseline inside the window restarts the clock.
    expect(reasons(old, "2026-06-01")).not.toContain("stale_last_contact");
    // A baseline that is itself older than the window does NOT rescue it.
    expect(reasons(old, "2026-01-15")).toContain("stale_last_contact");
  });

  it("never lets the baseline mask admin-set reasons", () => {
    const flagged: CareAttentionRow = {
      current_status: "concern",
      last_contact_at: "2026-06-04",
      next_touchpoint_due: "2026-06-01", // already overdue
    };
    const r = reasons(flagged, "2026-06-04");
    expect(r).toContain("concern_status");
    expect(r).toContain("overdue_touchpoint");
    // And the chip still fires off those admin-set reasons.
    expect(needsAttentionFromReasons(r)).toBe(true);
  });
});

describe("isCareContactStale — reset baseline", () => {
  const TODAY = "2026-06-05";

  it("treats a baseline as the contact floor", () => {
    // No real contact, no baseline → stale.
    expect(
      isCareContactStale({
        lastAdminContactIso: null,
        todayIso: TODAY,
        tier: "directly_overseen",
      })
    ).toBe(true);
    // No real contact but a recent baseline → fresh.
    expect(
      isCareContactStale({
        lastAdminContactIso: null,
        todayIso: TODAY,
        tier: "directly_overseen",
        baselineIso: "2026-06-01",
      })
    ).toBe(false);
    // Old real contact, recent baseline → fresh (later of the two wins).
    expect(
      isCareContactStale({
        lastAdminContactIso: "2026-01-01",
        todayIso: TODAY,
        tier: "directly_overseen",
        baselineIso: "2026-06-01",
      })
    ).toBe(false);
  });
});
