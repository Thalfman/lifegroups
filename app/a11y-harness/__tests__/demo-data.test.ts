import { describe, expect, it } from "vitest";

import { buildHarnessDemoData } from "@/app/a11y-harness/demo-data";
import {
  DEMO_GROUPS,
  DEMO_METRIC_DEFAULTS,
  DEMO_PROFILES,
} from "@/lib/dashboard/demo-seed";
import { BUILT_IN_READINESS_RULE } from "@/lib/admin/cell-readiness";

// Pin the builder-DERIVED values the a11y specs assert against (ADR 0038).
// The harness's seam-backed surfaces render whatever the real buildXData
// functions derive from the demo adapters' seed rows; this suite is the
// machine check that those derivations still land on the semantics the specs
// (follow-ups / settings / people / multiply-pipeline) and axe scans key on —
// so a builder or seed change surfaces here, in the default lane, instead of
// as a Playwright failure two suites later.

describe("a11y-harness demo data through the real builders", () => {
  const demoPromise = buildHarnessDemoData();

  it("follow-ups: a two-row queue with clean reads, and a truly empty variant", async () => {
    const { followUps, followUpsEmpty } = await demoPromise;

    expect(followUps.followUps.map((f) => f.title)).toEqual([
      "Reach out to Skyler about placement",
      "Confirm Anderson apprentice plan",
    ]);
    // The drawer's selects need the seed groups/profiles and the related
    // member + guest records behind the queue rows.
    expect(followUps.groups).toEqual(DEMO_GROUPS);
    expect(followUps.assigneeProfiles).toEqual(DEMO_PROFILES);
    expect(followUps.members.map((m) => m.full_name)).toEqual(["Jordan Avery"]);
    expect(followUps.guests.map((g) => g.full_name)).toEqual(["Skyler Monroe"]);
    expect(Object.values(followUps.errors)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);

    // The empty variant differs ONLY in the queue — the create drawer's
    // reference data must still be present while "No follow-ups yet" shows.
    expect(followUpsEmpty.followUps).toEqual([]);
    expect(followUpsEmpty.groups).toEqual(DEMO_GROUPS);
  });

  it("settings: live defaults, saved rubrics, the #478 override, and a clean rule decode", async () => {
    const { settings } = await demoPromise;

    expect(settings.defaultsSource).toBe("live");
    expect(settings.defaults).toEqual(DEMO_METRIC_DEFAULTS);
    expect(settings.groups).toEqual(DEMO_GROUPS);
    // The "Currently overridden" summary's canonical status label (#478).
    expect(
      settings.groupMetricSettings.find((s) => s.group_id === "fb-cap-ok-1")
        ?.manual_health_status_override
    ).toBe("needs_follow_up");
    // Saved rubrics decode to the demo criteria (weights sum to 100).
    expect(settings.hasSavedGroupRubric).toBe(true);
    expect(settings.groupRubricCriteria).toEqual([
      { key: "attendance", label: "Attendance", weight: 60 },
      { key: "unity", label: "Unity", weight: 40 },
    ]);
    expect(settings.leaderRubricCriteria).toEqual([
      { key: "walk", label: "Walk with God", weight: 50 },
      { key: "team", label: "Team development", weight: 50 },
    ]);
    expect(settings.groupTypes).toEqual([
      "Men's",
      "Women's",
      "Married Couples",
    ]);
    // The stored rule decodes cleanly — no stored-trigger-unreadable notice.
    // (ministryYear is build-time `currentMinistryYear(new Date())` — the one
    // nondeterminism, deliberately not pinned to a literal.)
    expect(settings.readiness).toEqual({
      ministryYear: expect.any(Number),
      ruleFellBack: false,
      rule: {
        interest: { required: true, min: 3 },
        capacity: { required: true },
        groupHealth: { required: false, min: "C" },
        leaderHealth: { required: false, min: "C" },
        memberCount: { required: false, min: 12 },
        groupTenure: { required: false, min: 3 },
        coShepherdTenure: { required: false, min: 1 },
      },
    });
    expect(Object.values(settings.errors)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("settings error variant: exactly the four #469 reads fail, through the real degrade path", async () => {
    const { settingsErrors } = await demoPromise;

    expect(settingsErrors.errors).toEqual({
      defaults: null,
      groups: null,
      overrides: null,
      groupRubric: "read failed",
      leaderRubric: "read failed",
      groupTypes: "read failed",
      readiness: "read failed",
    });
    // The genuinely degraded shape (not healthy-data-with-errors): a failed
    // rubric read keeps criteria empty so no editor can overwrite unread
    // config, and the readiness rule falls back to the built-in.
    expect(settingsErrors.groupRubricCriteria).toEqual([]);
    expect(settingsErrors.hasSavedGroupRubric).toBe(false);
    expect(settingsErrors.leaderRubricCriteria).toEqual([]);
    expect(settingsErrors.groupTypes).toEqual([]);
    expect(settingsErrors.readiness).toEqual({
      ministryYear: expect.any(Number),
      ruleFellBack: false,
      rule: BUILT_IN_READINESS_RULE,
    });
    // The healthy sections still render their live data behind the toggle.
    expect(settingsErrors.defaultsSource).toBe("live");
    expect(settingsErrors.groups).toEqual(DEMO_GROUPS);
  });

  it("people directory: every ladder rung below super_admin, members, and the pipeline group", async () => {
    const { people } = await demoPromise;

    expect(people.currentActorProfileId).toBe("p-priya");
    // One section per role, ordered down the ladder — the seed is all leaders,
    // so the three added rungs keep every section heading in the DOM.
    const roles = new Set(people.profiles.map((p) => p.role));
    expect(roles.has("ministry_admin")).toBe(true);
    expect(roles.has("over_shepherd")).toBe(true);
    expect(roles.has("co_leader")).toBe(true);
    // The builder's platform-owner filter.
    expect(roles.has("super_admin")).toBe(false);
    expect(people.members.map((m) => m.full_name)).toEqual([
      "Jordan Avery",
      "Riley Chen",
    ]);
    // Harbor Group joins the directory list so the pipeline group and its
    // memberships aren't orphan references.
    expect(people.groups.map((g) => g.name)).toContain("Harbor Group");
    expect(
      people.memberships.filter((m) => m.group_id === "people-group-1")
    ).toHaveLength(2);
    expect(Object.values(people.errors)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("people pipeline: one apprentice in Harbor Group with both member options", async () => {
    const { peoplePipeline } = await demoPromise;

    expect(peoplePipeline.error).toBeNull();
    expect(peoplePipeline.rollup.totalApprentices).toBe(1);
    // Only the pipeline's group is an active ref, so the gap list stays empty
    // (the dashboard seed groups feed the directory, not the rollup).
    expect(peoplePipeline.rollup.groupsWithoutApprentice).toEqual([]);
    expect(peoplePipeline.availableGroups).toEqual([
      { id: "people-group-1", name: "Harbor Group" },
    ]);
    expect(peoplePipeline.memberOptionsByGroup["people-group-1"]).toEqual([
      { id: "people-mem-1", name: "Jordan Avery" },
      { id: "people-mem-2", name: "Riley Chen" },
    ]);
  });

  it("multiply shepherds: two same-stage apprentices, a gap group, and member options", async () => {
    const { multiplyShepherds } = await demoPromise;

    expect(multiplyShepherds.error).toBeNull();
    // Two apprentices at the SAME stage — the spec proves their repeated
    // Advance / Edit controls stay unique by accessible name.
    expect(multiplyShepherds.rollup.totalApprentices).toBe(2);
    const inTraining = multiplyShepherds.rollup.stages.find(
      (s) => s.stage === "in_training"
    );
    expect(inTraining?.apprentices.map((a) => a.displayName).sort()).toEqual([
      "Dana Whitfield",
      "Miguel Torres",
    ]);
    // Kingsway has no apprentice — the gap list renders.
    expect(
      multiplyShepherds.rollup.groupsWithoutApprentice.map((g) => g.groupName)
    ).toEqual(["Kingsway Couples"]);
    // Builder-sorted (by name) — the spec only needs the Group select
    // populated and the member dropdown present for the selected group.
    expect(multiplyShepherds.availableGroups.map((g) => g.name)).toEqual([
      "Harbor Women",
      "Kingsway Couples",
      "Riverside Men",
    ]);
    expect(multiplyShepherds.memberOptionsByGroup["ms-group-1"]).toEqual([
      { id: "ms-mem-2", name: "Caleb Ruiz" },
      { id: "ms-mem-1", name: "Miguel Torres" },
    ]);
  });
});
