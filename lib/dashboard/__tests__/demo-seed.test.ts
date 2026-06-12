import { describe, expect, it } from "vitest";
import { buildAdminGroupModel } from "@/lib/dashboard/admin-group-model";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";
import {
  DEMO_METRIC_DEFAULTS,
  demoAdminModelInput,
} from "@/lib/dashboard/demo-seed";

// ADR-0011 follow-on: NONE of the demo dashboard shapes are hand-built any
// more. Capacity rows, health buckets, the attention queue, the setup-gap
// lists and the launch snapshot are all the live assembler's output for the
// demo seed, so the demo and the live dashboard derive both the shape and the
// rules from one place. These tests independently pin where each demo group
// lands so a regression in a shared rule surfaces as a group moving here.

describe("demo seed → capacity board", () => {
  it("buckets each demo group into the capacity state it models", () => {
    const cs = ADMIN_FALLBACK.capacitySummary;
    expect(cs.full.map((r) => r.groupId)).toEqual(["fb-cap-full-1"]);
    expect(cs.warning.map((r) => r.groupId)).toEqual([
      "fb-cap-warn-1",
      "fb-cap-warn-2",
    ]);
    // Sorted by utilisation desc: Lakeside 8/12, Eastside 7/12, Hillside 5/10.
    expect(cs.ok.map((r) => r.groupId)).toEqual([
      "fb-healthy-1",
      "fb-cap-ok-1",
      "fb-cap-ok-2",
    ]);
    expect(cs.unknown.map((r) => r.groupId)).toEqual(["fb-cap-unknown-1"]);
    expect(cs.excluded.map((r) => r.groupId)).toEqual(["fb-cap-excluded-1"]);
  });

  it("carries no hand-set thresholds — every row's warning/full pct is the shared default", () => {
    const cs = ADMIN_FALLBACK.capacitySummary;
    const rows = [
      ...cs.full,
      ...cs.warning,
      ...cs.ok,
      ...cs.unknown,
      ...cs.excluded,
    ];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.warningPct).toBe(
        DEMO_METRIC_DEFAULTS.capacity_warning_threshold_pct
      );
      expect(row.fullPct).toBe(
        DEMO_METRIC_DEFAULTS.capacity_full_threshold_pct
      );
    }
  });
});

describe("demo seed → health buckets", () => {
  it("buckets each demo group into the health state it models", () => {
    const hs = ADMIN_FALLBACK.healthSummary;
    expect(hs.needsFollowUp.map((r) => r.groupId)).toEqual(["fb-cap-full-1"]);
    expect(hs.watch.map((r) => r.groupId)).toEqual(["fb-cap-warn-1"]);
    // Sorted by name: Leadership Cohort, Northside Young Adults.
    expect(hs.submitted.map((r) => r.groupId)).toEqual([
      "fb-cap-excluded-1",
      "fb-cap-warn-2",
    ]);
    expect(hs.didNotMeet.map((r) => r.groupId)).toEqual(["fb-cap-ok-1"]);
    expect(hs.plannedPause.map((r) => r.groupId)).toEqual(["fb-cap-ok-2"]);
    // A scheduled weekly group with no session is "missing"; the pre-launch
    // group joins it. Sorted by name: Bridge Builders, Pending Launch Group.
    expect(hs.missing.map((r) => r.groupId)).toEqual([
      "fb-cap-unknown-1",
      "fb-no-leader-1",
    ]);
    // Off-parity bi-weekly with no session is NOT expected to meet → healthy.
    expect(hs.healthy.map((r) => r.groupId)).toEqual(["fb-healthy-1"]);
  });

  it("keeps the bucket counts in step with the lists", () => {
    const hs = ADMIN_FALLBACK.healthSummary;
    expect(hs.counts).toEqual({
      submitted: 2,
      missing: 2,
      did_not_meet: 1,
      planned_pause: 1,
      needs_follow_up: 1,
      watch: 1,
      healthy: 1,
      missing_required_ratings: 0,
    });
  });
});

describe("demo seed → attention queue", () => {
  it("surfaces one card per group with a reason, ordered by the shared priority ladder", () => {
    const items = ADMIN_FALLBACK.attentionItems;
    expect(items.map((i) => i.groupId)).toEqual([
      "fb-cap-full-1",
      "fb-cap-warn-1",
      "fb-cap-warn-2",
      "fb-cap-unknown-1",
      "fb-no-leader-1",
    ]);
    expect(items.map((i) => i.reason)).toEqual([
      "follow_up_open",
      "capacity_warning",
      "capacity_warning",
      "capacity_unknown",
      "no_leader",
    ]);
  });

  it("derives the at-capacity card's secondary reasons + detail from the rules, not by hand", () => {
    const top = ADMIN_FALLBACK.attentionItems[0];
    expect(top.groupId).toBe("fb-cap-full-1");
    // Open follow-up wins the ladder; at-capacity + needs-follow-up trail it.
    expect(top.secondaryReasons).toEqual([
      "capacity_full",
      "health_needs_follow_up",
    ]);
    expect(top.detail).toBe("1 open follow-up");
    expect(top.leaderNames).toEqual(["Priya Mehta"]);
  });

  it("derives the pre-launch card's no-leader/-members/-day reasons", () => {
    const launch = ADMIN_FALLBACK.attentionItems.find(
      (i) => i.groupId === "fb-no-leader-1"
    );
    expect(launch?.reason).toBe("no_leader");
    expect(launch?.secondaryReasons).toEqual([
      "no_members",
      "missing_meeting_day_time",
    ]);
    expect(launch?.leaderNames).toEqual([]);
    expect(launch?.lifecycleStatus).toBe("launching_soon");
  });
});

describe("demo seed → setup gaps", () => {
  it("lists each unfinished group under the gap it has", () => {
    const sg = ADMIN_FALLBACK.setupGaps;
    expect(sg.noCapacity.map((r) => r.groupId)).toEqual(["fb-cap-unknown-1"]);
    expect(sg.noLeader.map((r) => r.groupId)).toEqual(["fb-no-leader-1"]);
    expect(sg.noMeetingDayTime.map((r) => r.groupId)).toEqual([
      "fb-no-leader-1",
    ]);
    expect(sg.noMembers.map((r) => r.groupId)).toEqual(["fb-no-leader-1"]);
    expect(sg.counts).toEqual({
      noCapacity: 1,
      noLeader: 1,
      noMeetingDayTime: 1,
      noMembers: 1,
    });
  });
});

describe("demo seed → launch snapshot", () => {
  it("derives a representative watch-level forecast from the seed's capacity", () => {
    const lp = ADMIN_FALLBACK.launchPlanning;
    // 14+12+12+12+10+12 across the active, non-excluded, known-capacity groups;
    // Bridge Builders (unknown) and Leadership Cohort (excluded) contribute 0.
    expect(lp.effectiveTotalCapacity).toBe(72);
    expect(lp.currentParticipants).toBe(58);
    expect(lp.unknownCapacityGroupCount).toBe(1);
    expect(lp.excludedActiveGroupCount).toBe(1);
    expect(lp.currentChurchAttendance).toBe(110);
    expect(lp.participationPct).toBe(53);
    expect(lp.recommendedNewGroups).toBe(1);
    expect(lp.riskLevel).toBe("watch");
    // The baseline forecast hides growth, so it can never carry a launch-by
    // date — the hand-built copy used to claim one (a live-rule drift).
    expect(lp.suggestedLaunchByDate).toBeNull();
    expect(lp.assumptionsAvailable).toBe(true);
    expect(lp.available).toBe(true);
  });
});

describe("demo seed → vital-signs summary", () => {
  it("derives the headline counts so they can't contradict the boards below", () => {
    const s = ADMIN_FALLBACK.summary;
    // 8 active groups (the launching_soon pre-launch group is excluded);
    // 4 submitted, 1 missing (Bridge Builders), 1 needs-follow-up (South
    // Campus Women) — all consistent with the health/capacity boards.
    expect(s).toEqual({
      activeGroupCount: 8,
      submittedCheckIns: 4,
      missingCheckIns: 1,
      needsFollowUp: 1,
      capacityWatch: 3,
      unknownCapacity: 1,
    });
  });

  it("keeps the capacity tiles in step with the capacity board counts", () => {
    const s = ADMIN_FALLBACK.summary;
    const c = ADMIN_FALLBACK.capacitySummary.counts;
    expect(s.capacityWatch).toBe(c.full + c.warning);
    expect(s.unknownCapacity).toBe(c.unknown);
  });
});

describe("demo seed responds to shared rule changes", () => {
  it("reflects a shared capacity-rule change without editing the fallback module", () => {
    // Lower the warning threshold to 40%: groups previously "ok" now read
    // "warning" purely because the shared metrics rule changed — the demo rows
    // follow the rule, and nothing in lib/dashboard/fallback-data.ts is touched.
    const strict = {
      ...DEMO_METRIC_DEFAULTS,
      capacity_warning_threshold_pct: 40,
    };
    const model = buildAdminGroupModel(demoAdminModelInput(strict));
    const warningIds = model.capacitySummary.warning.map((r) => r.groupId);
    // Hillside (5/10 = 50%), Eastside (7/12 ≈ 58%) and Lakeside (8/12 ≈ 67%)
    // all cross the lowered 40% line that the default 80% left them under.
    expect(warningIds).toContain("fb-cap-ok-1");
    expect(warningIds).toContain("fb-cap-ok-2");
    expect(warningIds).toContain("fb-healthy-1");
    expect(model.capacitySummary.counts.ok).toBe(0);
  });
});
