import { describe, expect, it } from "vitest";

import {
  buildSettingsData,
  type SettingsReads,
} from "@/components/admin/settings/settings-data";
import type { ReadResult } from "@/lib/supabase/read-core";

const ok = <T>(data: T): ReadResult<T> => ({ data, error: null });
const fail = (message: string): ReadResult<never> => ({
  data: null,
  error: new Error(message),
});

// A successful, empty read for every Settings dependency; each test overrides
// only the reads it cares about. Two adapters, one seam (ADR 0015): this fake
// satisfies the same `SettingsReads` the live `supabaseSettingsReads` adapter
// does, so the type×category matrix assembly is exercised with no database.
function emptyReads(overrides: Partial<SettingsReads> = {}): SettingsReads {
  return {
    fetchMetricDefaults: async () => ok(null),
    fetchAllGroups: async () => ok([]),
    fetchAllGroupMetricSettings: async () => ok([]),
    fetchGroupHealthRubric: async () => ok(null),
    // #402: the global readiness rule defaults to absent (built-in rule in use).
    fetchReadinessRule: async () => ok(null),
    // #410: the per-type tier defaults to empty (every type inherits global).
    fetchAudienceReadinessRules: async () => ok([]),
    fetchLeaderHealthRubric: async () => ok(null),
    fetchGroupCategories: async () => ok([]),
    // #400: per-cell coverage reads default to empty.
    fetchCategoryTypeTargetCells: async () => ok([]),
    fetchGroupCellLifecycleRows: async () => ok([]),
    ...overrides,
  };
}

const CAT = "cat-2030";

describe("buildSettingsData — Groups tab catalog (#412)", () => {
  it("exposes an empty catalog when none exists (fresh ministry)", async () => {
    const data = await buildSettingsData(emptyReads(), { isSuperAdmin: false });
    expect(data.groupCategories).toEqual([]);
    expect(data.errors.groupCategories).toBeNull();
  });

  it("exposes the live catalog (id + label) for the create-flow dedupe", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([
            { id: CAT, label: "20-30s", created_at: "2026-06-06" },
            {
              id: "cat-fam",
              label: "Young families",
              created_at: "2026-06-06",
            },
          ]),
      }),
      { isSuperAdmin: false }
    );
    expect(data.groupCategories).toEqual([
      { id: CAT, label: "20-30s" },
      { id: "cat-fam", label: "Young families" },
    ]);
  });

  it("surfaces a catalog read failure on errors.groupCategories and degrades to an empty catalog", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () => fail("catalog boom"),
      }),
      { isSuperAdmin: false }
    );
    expect(data.errors.groupCategories).toBe("catalog boom");
    expect(data.groupCategories).toEqual([]);
  });

  it("surfaces a target-cell read failure on the same Groups-tab key", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchCategoryTypeTargetCells: async () => fail("cells boom"),
      }),
      { isSuperAdmin: false }
    );
    expect(data.errors.groupCategories).toBe("cells boom");
  });
});

describe("buildSettingsData — Groups tab coverage (#400)", () => {
  it("builds per-active-cell coverage (have X of Y), sorted by largest shortfall", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([{ id: CAT, label: "20-30s", created_at: "2026-06-06" }]),
        fetchCategoryTypeTargetCells: async () =>
          ok([
            {
              id: "cell-men",
              audience_category: "men",
              category_id: CAT,
              active: true,
              target_count: 3,
              trigger_overrides: {},
            },
            {
              id: "cell-women",
              audience_category: "women",
              category_id: CAT,
              active: true,
              target_count: 2,
              trigger_overrides: {},
            },
          ]),
        fetchGroupCellLifecycleRows: async () =>
          ok([
            // Men: one active + one launching = have 2, target 3 → gap 1.
            {
              audience_category: "men",
              category_id: CAT,
              lifecycle_status: "active",
            },
            {
              audience_category: "men",
              category_id: CAT,
              lifecycle_status: "launching_soon",
            },
            // A planned_pause group does NOT count.
            {
              audience_category: "men",
              category_id: CAT,
              lifecycle_status: "planned_pause",
            },
            // Women: have 0, target 2 → gap 2 (largest shortfall, sorts first).
          ]),
      }),
      { isSuperAdmin: false }
    );

    expect(data.cellCoverage.map((c) => c.audienceCategory)).toEqual([
      "women",
      "men",
    ]);
    expect(data.cellCoverage[0]).toMatchObject({
      audienceCategory: "women",
      have: 0,
      target: 2,
      gap: 2,
    });
    expect(data.cellCoverage[1]).toMatchObject({
      audienceCategory: "men",
      have: 2,
      target: 3,
      gap: 1,
    });
  });

  it("drops an inactive cell from coverage and resolves the label from the catalog", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([{ id: CAT, label: "20-30s", created_at: "2026-06-06" }]),
        fetchCategoryTypeTargetCells: async () =>
          ok([
            {
              id: "cell-mixed",
              audience_category: "mixed",
              category_id: CAT,
              active: false,
              target_count: 5,
              trigger_overrides: {},
            },
          ]),
      }),
      { isSuperAdmin: false }
    );
    expect(data.cellCoverage).toEqual([]);
  });
});

describe("buildSettingsData — Groups tab readiness rule (#402)", () => {
  it("falls back to the built-in rule when no global rule is stored", async () => {
    const data = await buildSettingsData(emptyReads(), { isSuperAdmin: false });
    expect(data.errors.readiness).toBeNull();
    // PRD §4.1 defaults: interest required at a small N, capacity required.
    expect(data.readiness?.rule.interest).toEqual({ required: true, min: 3 });
    expect(data.readiness?.rule.capacity).toEqual({ required: true });
    expect(data.readiness?.cells).toEqual([]);
  });

  it("decodes the stored global rule", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchReadinessRule: async () =>
          ok({
            id: "rule-1",
            ministry_year: 2026,
            rule: {
              interest: { required: true, min: 5 },
              capacity: { required: false },
              groupHealth: { required: true, min: "B" },
              leaderHealth: { required: false, min: "C" },
            },
            updated_at: "2026-06-06",
          }),
      }),
      { isSuperAdmin: false }
    );
    expect(data.readiness?.rule.interest).toEqual({ required: true, min: 5 });
    expect(data.readiness?.rule.capacity).toEqual({ required: false });
    expect(data.readiness?.rule.groupHealth).toEqual({
      required: true,
      min: "B",
    });
  });

  it("builds one override row per ACTIVE, live-category cell and decodes its overrides", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchGroupCategories: async () =>
          ok([{ id: CAT, label: "20-30s", created_at: "2026-06-06" }]),
        fetchCategoryTypeTargetCells: async () =>
          ok([
            {
              id: "cell-men",
              audience_category: "men",
              category_id: CAT,
              active: true,
              target_count: 0,
              trigger_overrides: { interest: { required: true, min: 7 } },
            },
            // An INACTIVE cell is excluded from the override rows.
            {
              id: "cell-women",
              audience_category: "women",
              category_id: CAT,
              active: false,
              target_count: 0,
              trigger_overrides: {},
            },
          ]),
      }),
      { isSuperAdmin: false }
    );
    expect(data.readiness?.cells).toHaveLength(1);
    const cell = data.readiness?.cells[0];
    expect(cell?.audienceCategory).toBe("men");
    expect(cell?.label).toBe("20-30s");
    expect(cell?.override).toEqual({ interest: { required: true, min: 7 } });
  });

  it("surfaces a readiness-rule read failure on errors.readiness", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchReadinessRule: async () => fail("rule boom"),
      }),
      { isSuperAdmin: false }
    );
    expect(data.errors.readiness).toBe("rule boom");
  });
});

describe("buildSettingsData — Multiply tab per-type tier (#410/#411)", () => {
  it("defaults the per-type tier to empty when no rule is stored", async () => {
    const data = await buildSettingsData(emptyReads(), { isSuperAdmin: false });
    expect(data.errors.readiness).toBeNull();
    expect(data.readiness?.perType).toEqual({});
  });

  it("decodes the per-type rules keyed by audience_category", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchAudienceReadinessRules: async () =>
          ok([
            {
              id: "men-rule",
              ministry_year: 2026,
              audience_category: "men" as const,
              // A partial: only Interest overrides global; the rest inherit.
              rule: { interest: { required: true, min: 5 } },
              updated_at: "2026-06-06",
            },
            {
              id: "women-rule",
              ministry_year: 2026,
              audience_category: "women" as const,
              rule: { groupHealth: { required: true, min: "B" } },
              updated_at: "2026-06-06",
            },
          ]),
      }),
      { isSuperAdmin: false }
    );
    expect(data.readiness?.perType.men).toEqual({
      interest: { required: true, min: 5 },
    });
    expect(data.readiness?.perType.women).toEqual({
      groupHealth: { required: true, min: "B" },
    });
    // Mixed has no row, so it is absent (inherits global for every pillar).
    expect(data.readiness?.perType.mixed).toBeUndefined();
  });

  it("surfaces a per-type readiness read failure on errors.readiness", async () => {
    const data = await buildSettingsData(
      emptyReads({
        fetchAudienceReadinessRules: async () => fail("per-type boom"),
      }),
      { isSuperAdmin: false }
    );
    expect(data.errors.readiness).toBe("per-type boom");
  });
});
