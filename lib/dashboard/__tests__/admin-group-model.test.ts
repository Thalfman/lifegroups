import { describe, expect, it } from "vitest";
import {
  buildAdminGroupModel,
  type AdminGroupModel,
  type AdminGroupModelInput,
} from "@/lib/dashboard/admin-group-model";
import { decodeMetricDefaults } from "@/lib/admin/metrics";
import { formatWeekLabel } from "@/lib/admin/check-ins";
import { isoWeekStart, isoWeekNumberOf } from "@/lib/shared/church-time";
import { group, memberships, settings } from "@/lib/dashboard/group-fixtures";
import type {
  AttendanceSessionsRow,
  GroupCalendarEventsRow,
  GroupHealthUpdatesRow,
  GroupLeadersRow,
  ProfilesRow,
} from "@/types/database";
import type {
  GuestDirectoryEntry,
  LeaderFollowUpRow,
} from "@/lib/supabase/read-models";
import type {
  AttendanceSessionStatus,
  GroupCalendarEventStatus,
  GroupHealthStatus,
  GuestPipelineStage,
  MeetingWeekParity,
} from "@/types/enums";

// This is the cross-domain join the inline map in queries.ts used to hide
// behind a Supabase read. Feeding raw arrays straight into
// buildAdminGroupModel makes every interlock — overdue suppression, the
// off-parity gate, the latest-Health-Pulse tiebreak, the manual-override
// precedence, capacity thresholds, the calendar override feeding due math,
// and the membership/leader/setup joins — assertable without a client.

// decodeMetricDefaults(null) yields the built-in defaults: capacity 12,
// warning 80%, full 100%, offset 24h.
const DEFAULTS = decodeMetricDefaults(null);
// A past Monday, so `now` can sit well after the Tuesday meeting and the
// week's check-in is unambiguously overdue.
const SELECTED_WEEK = "2026-05-18";
const NOW = new Date("2026-05-30T12:00:00Z");

function session(
  overrides: Partial<AttendanceSessionsRow> & {
    group_id: string;
    status: AttendanceSessionStatus;
  }
): AttendanceSessionsRow {
  return {
    id: `s-${overrides.group_id}`,
    meeting_week: SELECTED_WEEK,
    meeting_date: null,
    submitted_by: null,
    submitted_at: null,
    leader_note: null,
    admin_note: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function health(
  overrides: Partial<GroupHealthUpdatesRow> & { group_id: string }
): GroupHealthUpdatesRow {
  return {
    id: `h-${overrides.group_id}-${overrides.update_week ?? "w"}`,
    submitted_by: null,
    update_week: SELECTED_WEEK,
    pulse: "healthy" as GroupHealthStatus,
    follow_up_needed: false,
    leader_note: null,
    admin_note: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function leader(
  overrides: Partial<GroupLeadersRow> & { group_id: string; profile_id: string }
): GroupLeadersRow {
  return {
    id: `l-${overrides.profile_id}`,
    role: "leader",
    assigned_at: "2024-01-01",
    active: true,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function profile(
  id: string,
  full_name: string,
  overrides: Partial<ProfilesRow> = {}
): ProfilesRow {
  return {
    id,
    auth_user_id: null,
    full_name,
    full_name_pending: false,
    email: `${id}@example.com`,
    phone: null,
    role: "leader",
    status: "active",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function calendarEvent(
  overrides: Partial<GroupCalendarEventsRow> & {
    group_id: string;
    event_date: string;
    status: GroupCalendarEventStatus;
  }
): GroupCalendarEventsRow {
  return {
    id: `c-${overrides.group_id}-${overrides.event_date}`,
    start_time: null,
    end_time: null,
    event_type: "study",
    title: null,
    description: null,
    created_by: null,
    updated_by: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function guest(
  pipeline_stage: GuestPipelineStage,
  id = `guest-${pipeline_stage}`
): GuestDirectoryEntry {
  return {
    id,
    full_name: "Guest",
    email: null,
    phone: null,
    first_attended_group_id: null,
    first_attended_date: null,
    pipeline_stage,
    assigned_group_id: null,
    follow_up_owner_id: null,
    notes: null,
    created_at: "2024-01-01T00:00:00Z",
  };
}

function followUp(
  overrides: Partial<LeaderFollowUpRow> & { related_group_id: string }
): LeaderFollowUpRow {
  return {
    id: `fu-${overrides.related_group_id}`,
    type: "admin",
    title: "Follow up",
    related_member_id: null,
    related_guest_id: null,
    assigned_to: null,
    priority: "normal",
    due_date: null,
    status: "open",
    leader_visible_note: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

function buildModel(
  input: Partial<AdminGroupModelInput> = {}
): AdminGroupModel {
  return buildAdminGroupModel({
    groups: [],
    memberships: [],
    sessions: [],
    healthUpdates: [],
    leaders: [],
    profiles: [],
    metricSettings: [],
    calendarEvents: [],
    guests: [],
    followUps: [],
    defaults: DEFAULTS,
    selectedWeek: SELECTED_WEEK,
    now: NOW,
    activeGroupCount: null,
    ...input,
  });
}

function rowFor(model: AdminGroupModel, groupId: string) {
  const row = model.derivedRows.find((r) => r.group.id === groupId);
  if (!row) throw new Error(`no derived row for ${groupId}`);
  return row;
}

// The cadence-week parity of SELECTED_WEEK, so we can deterministically
// pick the bi-weekly parity that is OFF for this week vs ON for it.
const WEEK_IS_ODD = (isoWeekNumberOf(SELECTED_WEEK) ?? 0) % 2 === 1;
const OFF_PARITY: MeetingWeekParity = WEEK_IS_ODD ? "even" : "odd";
const ON_PARITY: MeetingWeekParity = WEEK_IS_ODD ? "odd" : "even";

describe("buildAdminGroupModel — overdue suppression interlock", () => {
  // Same overdue-by-date due inputs for every case; only the session
  // status differs. no_session / not_submitted are still overdue, proving
  // the date is genuinely past due — so the `false` rows are suppression,
  // not "wasn't overdue anyway".
  const cases: [AttendanceSessionStatus | "no_session", boolean][] = [
    ["no_session", true],
    ["not_submitted", true],
    ["submitted", false],
    ["admin_entered", false],
    ["did_not_meet", false],
    ["planned_pause", false],
  ];

  for (const [status, expectedOverdue] of cases) {
    it(`isOverdue=${expectedOverdue} when the week's session is ${status}`, () => {
      const sessions =
        status === "no_session"
          ? []
          : [session({ group_id: "group-a", status })];
      const model = buildModel({ groups: [group()], sessions });
      const row = rowFor(model, "group-a");
      expect(row.isScheduledThisWeek).toBe(true);
      expect(row.isOverdue).toBe(expectedOverdue);
    });
  }
});

describe("buildAdminGroupModel — off-parity / scheduling gate", () => {
  it("counts a weekly no-session group as missing but not a bi-weekly off-parity one", () => {
    const weekly = group({ id: "weekly" });
    const offParity = group({
      id: "offparity",
      meeting_frequency: "biweekly",
      meeting_week_parity: OFF_PARITY,
    });
    const model = buildModel({ groups: [weekly, offParity] });

    expect(rowFor(model, "weekly").isScheduledThisWeek).toBe(true);
    expect(rowFor(model, "offparity").isScheduledThisWeek).toBe(false);

    // Only the weekly group counts toward "missing"; the off-parity group
    // falls through to healthy rather than missing.
    expect(model.summary.missingCheckIns).toBe(1);
    expect(model.healthSummary.missing.map((r) => r.groupId)).toEqual([
      "weekly",
    ]);
    expect(model.healthSummary.healthy.map((r) => r.groupId)).toContain(
      "offparity"
    );
  });

  it("counts a bi-weekly on-parity no-session group as missing", () => {
    const onParity = group({
      id: "onparity",
      meeting_frequency: "biweekly",
      meeting_week_parity: ON_PARITY,
    });
    const model = buildModel({ groups: [onParity] });
    expect(rowFor(model, "onparity").isScheduledThisWeek).toBe(true);
    expect(model.summary.missingCheckIns).toBe(1);
  });
});

describe("buildAdminGroupModel — health reset baseline (health-checks-reset)", () => {
  // A weekly group with no session for the selected week is "missing" by
  // default; a health reset baseline at/after the selected week withholds it.
  it("suppresses missing when the global baseline week is at/after the selected week", () => {
    const base = buildModel({ groups: [group()] });
    expect(base.summary.missingCheckIns).toBe(1);
    expect(base.healthSummary.counts.missing).toBe(1);

    const reset = buildModel({
      groups: [group()],
      healthBaselines: { global: SELECTED_WEEK, byEntityId: new Map() },
    });
    expect(reset.summary.missingCheckIns).toBe(0);
    expect(reset.healthSummary.counts.missing).toBe(0);
    // Suppression is recorded on the row, and the group falls through to healthy.
    expect(rowFor(reset, "group-a").healthMissingSuppressed).toBe(true);
    expect(reset.healthSummary.counts.healthy).toBe(1);
  });

  it("does NOT suppress missing when the baseline week is earlier than the selected week", () => {
    const reset = buildModel({
      groups: [group()],
      healthBaselines: { global: "2026-05-11", byEntityId: new Map() },
    });
    expect(reset.summary.missingCheckIns).toBe(1);
    expect(reset.healthSummary.counts.missing).toBe(1);
  });

  it("honours a per-group override over the global baseline", () => {
    const reset = buildModel({
      groups: [group({ id: "a" }), group({ id: "b" })],
      healthBaselines: {
        global: null,
        byEntityId: new Map([["a", SELECTED_WEEK]]),
      },
    });
    // Only "a" is suppressed; "b" still reads missing.
    expect(reset.healthSummary.missing.map((r) => r.groupId)).toEqual(["b"]);
    expect(reset.summary.missingCheckIns).toBe(1);
  });

  it("leaves needs_follow_up unaffected by a health baseline", () => {
    // A pulse flagged for follow-up surfaces as needs_follow_up regardless of a
    // baseline — the baseline governs only the absence-derived "missing" half.
    const flagged = group({ id: "flagged" });
    const updates = [health({ group_id: "flagged", follow_up_needed: true })];
    const reset = buildModel({
      groups: [flagged],
      healthUpdates: updates,
      healthBaselines: { global: SELECTED_WEEK, byEntityId: new Map() },
    });
    expect(reset.healthSummary.counts.needs_follow_up).toBe(1);
    expect(reset.healthSummary.counts.missing).toBe(0);
  });
});

describe("buildAdminGroupModel — latest Health Pulse by week", () => {
  it("keeps the greatest update_week even when an earlier row appears last in the array", () => {
    const earlier = health({
      group_id: "group-a",
      update_week: "2026-05-04",
      pulse: "healthy",
      follow_up_needed: false,
    });
    const later = health({
      group_id: "group-a",
      update_week: "2026-05-18",
      pulse: "watch",
      follow_up_needed: true,
    });
    // Earlier row last in the array: a naive "last wins" would pick it.
    const model = buildModel({
      groups: [group()],
      healthUpdates: [later, earlier],
    });
    const row = rowFor(model, "group-a");
    expect(row.healthUpdate?.update_week).toBe("2026-05-18");
    expect(row.followUpNeeded).toBe(true);
    // The later pulse flagged follow-up, so the group needs follow-up.
    expect(model.summary.needsFollowUp).toBe(1);
  });
});

describe("buildAdminGroupModel — health assessment rating gaps", () => {
  it("separates unassessed groups from partial required health ratings", () => {
    const rated = group({ id: "rated", name: "Rated" });
    const partial = group({ id: "partial", name: "Partial" });
    const unassessed = group({ id: "unassessed", name: "Unassessed" });
    const closed = group({
      id: "closed",
      name: "Closed",
      lifecycle_status: "closed",
    });
    const model = buildModel({
      groups: [rated, partial, unassessed, closed],
      healthAssessmentRatings: [
        {
          group_id: "rated",
          spiritual_growth_score: 4,
          group_question_score: 4,
        },
        {
          group_id: "partial",
          spiritual_growth_score: null,
          group_question_score: 4,
        },
        {
          group_id: "closed",
          spiritual_growth_score: null,
          group_question_score: null,
        },
      ],
    });

    expect(model.healthSummary.counts.not_assessed).toBe(1);
    expect(model.healthSummary.counts.missing_required_ratings).toBe(1);
  });
});

describe("buildAdminGroupModel — manual health override precedence", () => {
  it("lets a manual override beat the group's own health_status", () => {
    const g = group({ id: "g", health_status: "healthy" });
    const override = settings({
      group_id: "g",
      manual_health_status_override: "needs_follow_up",
    });
    const model = buildModel({ groups: [g], metricSettings: [override] });
    const row = rowFor(model, "g");

    expect(row.effectiveHealth).toBe("needs_follow_up");
    expect(row.hasManualHealthOverride).toBe(true);
    expect(model.healthSummary.needsFollowUp.map((r) => r.groupId)).toEqual([
      "g",
    ]);
    expect(model.summary.needsFollowUp).toBe(1);
    expect(model.attentionItems.find((i) => i.groupId === "g")?.reason).toBe(
      "health_needs_follow_up"
    );
  });
});

describe("buildAdminGroupModel — needsFollowUp triple condition", () => {
  it("counts groups flagged via effective health OR a follow-up Pulse, but not healthy ones", () => {
    const viaHealth = group({
      id: "via-health",
      health_status: "needs_follow_up",
    });
    const viaPulse = group({ id: "via-pulse", health_status: "healthy" });
    const healthy = group({ id: "healthy", health_status: "healthy" });
    const model = buildModel({
      groups: [viaHealth, viaPulse, healthy],
      healthUpdates: [
        health({
          group_id: "via-pulse",
          pulse: "healthy",
          follow_up_needed: true,
        }),
        health({
          group_id: "healthy",
          pulse: "healthy",
          follow_up_needed: false,
        }),
      ],
    });
    expect(model.summary.needsFollowUp).toBe(2);
    expect(
      model.healthSummary.needsFollowUp.map((r) => r.groupId).sort()
    ).toEqual(["via-health", "via-pulse"]);
  });
});

describe("buildAdminGroupModel — capacity status thresholds", () => {
  it("partitions ok / warning / full / open-by-choice / excluded / unknown", () => {
    // default_group_capacity null so the capacity-less group reads unknown
    // rather than inheriting a default.
    const defaults = { ...DEFAULTS, default_group_capacity: null };
    const groups = [
      group({ id: "ok", capacity: 12 }), // 5/12 = 42% → ok
      group({ id: "warning", capacity: 10 }), // 8/10 = 80% → warning
      group({ id: "full", capacity: 10 }), // 10/10 = 100% → full
      group({ id: "over", capacity: 10 }), // 10/10 but allow_over → open_by_choice
      group({ id: "excluded", capacity: 10 }),
      group({ id: "unknown", capacity: null }),
    ];
    const model = buildModel({
      defaults,
      groups,
      memberships: [
        ...memberships("ok", 5),
        ...memberships("warning", 8),
        ...memberships("full", 10),
        ...memberships("over", 10),
        ...memberships("excluded", 3),
        ...memberships("unknown", 4),
      ],
      metricSettings: [
        settings({ group_id: "over", allow_over_capacity: true }),
        settings({ group_id: "excluded", exclude_from_capacity_metrics: true }),
      ],
    });

    expect(rowFor(model, "ok").capacityStatusValue).toBe("ok");
    expect(rowFor(model, "warning").capacityStatusValue).toBe("warning");
    expect(rowFor(model, "full").capacityStatusValue).toBe("full");
    expect(rowFor(model, "over").capacityStatusValue).toBe("open_by_choice");
    expect(rowFor(model, "excluded").capacityStatusValue).toBe("excluded");
    expect(rowFor(model, "unknown").capacityStatusValue).toBe("unknown");

    // open_by_choice folds into the ok bucket for summary counts.
    expect(model.capacitySummary.counts).toEqual({
      full: 1,
      warning: 1,
      ok: 2,
      unknown: 1,
      excluded: 1,
    });
    expect(model.summary.capacityWatch).toBe(2); // full + warning
    expect(model.summary.unknownCapacity).toBe(1);
  });
});

describe("buildAdminGroupModel — calendar override feeds due math", () => {
  // SELECTED_WEEK Monday 2026-05-18 → the Tuesday occurrence is 2026-05-19.
  const OCCURRENCE = "2026-05-19";

  it("suppresses overdue/missing when an OFF override lands on the cadence occurrence", () => {
    const model = buildModel({
      groups: [group()],
      calendarEvents: [
        calendarEvent({
          group_id: "group-a",
          event_date: OCCURRENCE,
          status: "off",
        }),
      ],
    });
    const row = rowFor(model, "group-a");
    expect(row.isScheduledThisWeek).toBe(false);
    expect(row.isOverdue).toBe(false);
    expect(row.dueLabel).toBeNull();
    expect(model.summary.missingCheckIns).toBe(0);
  });

  it("ignores an OFF override on a non-occurrence date", () => {
    const model = buildModel({
      groups: [group()],
      calendarEvents: [
        calendarEvent({
          group_id: "group-a",
          event_date: "2026-05-20", // Wednesday, not the Tuesday occurrence
          status: "off",
        }),
      ],
    });
    const row = rowFor(model, "group-a");
    expect(row.isScheduledThisWeek).toBe(true);
    expect(row.isOverdue).toBe(true);
    expect(model.summary.missingCheckIns).toBe(1);
  });
});

describe("buildAdminGroupModel — membership / leader / setup joins", () => {
  it("counts memberships per group and orders leaders primary-first by name", () => {
    const g = group({ id: "g" });
    const model = buildModel({
      groups: [g],
      memberships: memberships("g", 3),
      leaders: [
        leader({ group_id: "g", profile_id: "amy", role: "co_leader" }),
        leader({ group_id: "g", profile_id: "zoe", role: "leader" }),
        // A leader whose profile is missing is dropped from the names.
        leader({ group_id: "g", profile_id: "ghost", role: "co_leader" }),
      ],
      profiles: [profile("amy", "Amy Adams"), profile("zoe", "Zoe Zimmer")],
    });
    const row = rowFor(model, "g");
    expect(row.activeMemberCount).toBe(3);
    // Primary leader first, then co-leaders; the profile-less leader is gone.
    expect(row.leaderNames).toEqual(["Zoe Zimmer", "Amy Adams"]);
    expect(row.hasLeader).toBe(true);
  });

  it("surfaces a bare group in every setup-gap list", () => {
    const bare = group({
      id: "bare",
      meeting_day: null,
      meeting_time: null,
      capacity: null,
    });
    const model = buildModel({ groups: [bare] });

    expect(model.setupGaps.noCapacity.map((r) => r.groupId)).toEqual(["bare"]);
    expect(model.setupGaps.noLeader.map((r) => r.groupId)).toEqual(["bare"]);
    expect(model.setupGaps.noMeetingDayTime.map((r) => r.groupId)).toEqual([
      "bare",
    ]);
    expect(model.setupGaps.noMembers.map((r) => r.groupId)).toEqual(["bare"]);
  });
});

describe("buildAdminGroupModel — follow-ups, guests, and attention queue", () => {
  it("groups open follow-ups by group and leads the attention queue with them", () => {
    const g = group({ id: "g" });
    const model = buildModel({
      groups: [g],
      memberships: memberships("g", 4),
      followUps: [
        followUp({ related_group_id: "g", id: "fu-1" }),
        followUp({ related_group_id: "g", id: "fu-2" }),
        // Unrelated follow-up is ignored.
        followUp({ related_group_id: "other", id: "fu-3" }),
      ],
    });
    const item = model.attentionItems.find((i) => i.groupId === "g");
    expect(item?.reason).toBe("follow_up_open");
    expect(item?.detail).toBe("2 open follow-ups");
    // Two follow-ups attached to a known group, plus one orphan, surface as
    // dashboard follow-up items.
    expect(model.followUps).toHaveLength(3);
  });

  it("counts the active guest pipeline, excluding placed and not_now", () => {
    const model = buildModel({
      guests: [
        guest("new"),
        guest("contacted"),
        guest("interested"),
        guest("placed"),
        guest("not_now"),
      ],
    });
    expect(model.guestPipelineCount).toBe(3);
    const byStage = Object.fromEntries(
      model.guestPipelineBreakdown.map((s) => [s.stage, s.count])
    );
    expect(byStage.new).toBe(1);
    expect(byStage.placed).toBe(1);
    expect(byStage.not_now).toBe(1);
  });
});

describe("buildAdminGroupModel — meta and aggregate counts", () => {
  it("derives the week meta and respects an explicit active-group count", () => {
    const model = buildModel({ groups: [group()], activeGroupCount: 7 });
    expect(model.meetingWeek).toBe(SELECTED_WEEK);
    expect(model.weekLabel).toBe(formatWeekLabel(SELECTED_WEEK));
    // SELECTED_WEEK is two weeks before NOW's week, so it isn't the current week.
    expect(model.isCurrentWeek).toBe(false);
    expect(model.summary.activeGroupCount).toBe(7);
  });

  it("falls back to counting active rows when no active-group count is given", () => {
    const model = buildModel({
      groups: [
        group({ id: "a", lifecycle_status: "active" }),
        group({ id: "b", lifecycle_status: "active" }),
        group({ id: "c", lifecycle_status: "closed" }),
      ],
      activeGroupCount: null,
    });
    expect(model.summary.activeGroupCount).toBe(2);
  });

  it("treats the selected week as current when now falls in it", () => {
    const now = new Date("2026-05-19T12:00:00Z"); // Tuesday of SELECTED_WEEK
    expect(isoWeekStart(now)).toBe(SELECTED_WEEK);
    const model = buildModel({ groups: [group()], now });
    expect(model.isCurrentWeek).toBe(true);
  });

  it("excludes closed groups from every section", () => {
    const closed = group({
      id: "closed",
      lifecycle_status: "closed",
      meeting_day: null,
      meeting_time: null,
      capacity: null,
    });
    const model = buildModel({ groups: [closed] });
    expect(model.capacitySummary.counts).toEqual({
      full: 0,
      warning: 0,
      ok: 0,
      unknown: 0,
      excluded: 0,
    });
    expect(model.attentionItems).toEqual([]);
    expect(model.setupGaps.counts).toEqual({
      noCapacity: 0,
      noLeader: 0,
      noMeetingDayTime: 0,
      noMembers: 0,
    });
    // Health buckets skip closed groups too.
    const totalHealth =
      model.healthSummary.counts.submitted +
      model.healthSummary.counts.missing +
      model.healthSummary.counts.did_not_meet +
      model.healthSummary.counts.planned_pause +
      model.healthSummary.counts.needs_follow_up +
      model.healthSummary.counts.watch +
      model.healthSummary.counts.healthy;
    expect(totalHealth).toBe(0);
  });
});
