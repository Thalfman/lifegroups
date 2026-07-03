import { describe, expect, it } from "vitest";
import type { ReadClient } from "@/lib/supabase/read-core";
import {
  AUDIT_EVENT_COLUMNS,
  fetchRecentAuditEvents,
} from "@/lib/supabase/follow-up-reads";
import {
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchGroupRefs,
  fetchGroupsByIds,
  fetchLeaderGroupsByIds,
  GROUP_COLUMNS,
  GROUP_LEADER_COLUMNS,
} from "@/lib/supabase/group-reads";
import {
  fetchApprenticePickerRefs,
  fetchLeaderPipelineForAdmin,
  fetchMultiplicationCandidatesForAdmin,
} from "@/lib/supabase/multiplication-reads";
import { fetchRecentUsageEvents } from "@/lib/supabase/super-admin-console-reads";
import {
  fetchActiveMemberships,
  fetchAllMembers,
  fetchMembersByIds,
  fetchProfilesForAdmin,
  GROUP_MEMBERSHIP_COLUMNS,
  MEMBER_COLUMNS,
  PROFILE_COLUMNS,
} from "@/lib/supabase/membership-reads";
import {
  fetchGuests,
  fetchNewGuestsForGroupSince,
  GUEST_COLUMNS,
} from "@/lib/supabase/guest-reads";
import {
  ATTENDANCE_RECORD_COLUMNS,
  ATTENDANCE_SESSION_COLUMNS,
  fetchAttendanceRecordsForSessions,
  fetchAttendanceSessions,
} from "@/lib/supabase/attendance-reads";
import {
  fetchGroupHealthAssessmentRatings,
  fetchLatestHealthUpdates,
  GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS,
  GROUP_HEALTH_UPDATE_COLUMNS,
} from "@/lib/supabase/health-reads";
import {
  fetchGroupCalendarEvents,
  GROUP_CALENDAR_EVENT_COLUMNS,
} from "@/lib/supabase/calendar-reads";
import {
  APP_SETTINGS_COLUMNS,
  fetchChurchAttendanceSnapshots,
  fetchGroupHealthRubricSetting,
  fetchGroupMetricSettings,
  fetchGroupTypeConfigs,
  fetchLaunchPlanningAssumptions,
  fetchLaunchPlanningScenariosForAdmin,
  fetchMetricDefaults,
  fetchAllGroupMetricSettings,
  GROUP_METRIC_SETTINGS_COLUMNS,
} from "@/lib/supabase/settings-reads";
import {
  fetchGroupRubricGradeRow,
  fetchHealthRubric,
  fetchLeaderRubricGradeRow,
  GROUP_RUBRIC_GRADE_COLUMNS,
  HEALTH_RUBRIC_COLUMNS,
  LEADER_RUBRIC_GRADE_COLUMNS,
} from "@/lib/supabase/rubric-grade-reads";
import {
  ADMIN_GROUP_RUBRIC_GRADE_YEAR_COLUMNS,
  ADMIN_LEADER_RUBRIC_GRADE_YEAR_COLUMNS,
  fetchGroupRubricGradesForYear,
  fetchLeaderRubricGradesForYear,
} from "@/lib/supabase/care-accordion-reads";

// Pins the shared read-model column allowlists (#495), following the shape of
// the session profile pinning test (#492). These fetchers are the high-fan-out
// reads behind the admin surfaces, so they are exactly where a broad
// select("*") would ship every current AND future column of a table to every
// caller by default. Each family below freezes its allowlist to the columns
// the fetcher's row type carries: adding a table column (or widening an
// allowlist) cannot silently widen a read — it has to show up here as a
// deliberate diff.

const UUID_A = "11111111-1111-1111-1111-111111111111";

// Minimal client stub mirroring the chain shapes used by the read-model
// fetchers (`.from(t).select(...)` followed by filter/order/limit/range
// chaining, then awaited directly or via `.maybeSingle()`), capturing the
// argument passed to select() per table so the tests can assert each live
// read uses its allowlist — not just that the exported constant looks right.
type CapturingBuilder = {
  select: (...args: unknown[]) => CapturingBuilder;
  order: () => CapturingBuilder;
  eq: () => CapturingBuilder;
  in: () => CapturingBuilder;
  is: () => CapturingBuilder;
  not: () => CapturingBuilder;
  or: () => CapturingBuilder;
  gte: () => CapturingBuilder;
  lte: () => CapturingBuilder;
  lt: () => CapturingBuilder;
  like: () => CapturingBuilder;
  limit: () => CapturingBuilder;
  range: () => CapturingBuilder;
  returns: () => CapturingBuilder;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  then: (
    onFulfilled?: ((value: { data: never[]; error: null }) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null
  ) => Promise<unknown>;
};

function makeSelectCapturingClient(
  selectCalls: Map<string, unknown[]>
): ReadClient {
  function makeBuilder(table: string): CapturingBuilder {
    const builder: CapturingBuilder = {
      select(...args: unknown[]) {
        const calls = selectCalls.get(table) ?? [];
        calls.push(args[0]);
        selectCalls.set(table, calls);
        return builder;
      },
      order: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      not: () => builder,
      or: () => builder,
      gte: () => builder,
      lte: () => builder,
      lt: () => builder,
      like: () => builder,
      limit: () => builder,
      range: () => builder,
      returns: () => builder,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (onFulfilled, onRejected) =>
        Promise.resolve({ data: [] as never[], error: null }).then(
          onFulfilled,
          onRejected
        ),
    };
    return builder;
  }
  return {
    from: (table: string) => makeBuilder(table),
  } as unknown as ReadClient;
}

async function captureSelects(
  run: (client: ReadClient) => Promise<unknown>
): Promise<Map<string, unknown[]>> {
  const selectCalls = new Map<string, unknown[]>();
  await run(makeSelectCapturingClient(selectCalls));
  return selectCalls;
}

// ── groups ───────────────────────────────────────────────────────────────────

const PINNED_GROUP_COLUMNS = [
  "id",
  "name",
  "description",
  "meeting_day",
  "meeting_time",
  "meeting_frequency",
  "meeting_week_parity",
  "location_area",
  "address_optional",
  "capacity",
  "lifecycle_status",
  "health_status",
  "group_type",
  "launched_on",
  "pause_reason",
  "pause_start_date",
  "expected_return_date",
  "restart_reminder_date",
  "admin_notes",
  "created_at",
  "updated_at",
  "closed_at",
] as const;

describe("groups read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the groups reads must be a deliberate diff here", () => {
    expect([...GROUP_COLUMNS.list]).toEqual([...PINNED_GROUP_COLUMNS]);
  });

  it("never selects '*'", () => {
    expect(GROUP_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the groups reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAllGroups(client);
      await fetchGroupsByIds(client, [UUID_A]);
    });
    expect(calls.get("groups")).toEqual([
      PINNED_GROUP_COLUMNS.join(", "),
      PINNED_GROUP_COLUMNS.join(", "),
    ]);
  });
});

// ── profiles ─────────────────────────────────────────────────────────────────

const PINNED_PROFILE_COLUMNS = [
  "id",
  "auth_user_id",
  "full_name",
  "email",
  "phone",
  "role",
  "status",
  "created_at",
  "updated_at",
] as const;

describe("profiles read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the profiles read must be a deliberate diff here", () => {
    expect([...PROFILE_COLUMNS.list]).toEqual([...PINNED_PROFILE_COLUMNS]);
  });

  it("never selects '*'", () => {
    expect(PROFILE_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the profiles read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchProfilesForAdmin(client);
    });
    expect(calls.get("profiles")).toEqual([PINNED_PROFILE_COLUMNS.join(", ")]);
  });
});

// ── members ──────────────────────────────────────────────────────────────────

const PINNED_MEMBER_COLUMNS = [
  "id",
  "full_name",
  "email",
  "phone",
  "household_name",
  "status",
  "care_sensitivity_flag",
  "created_at",
  "updated_at",
] as const;

describe("members read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the members reads must be a deliberate diff here", () => {
    expect([...MEMBER_COLUMNS.list]).toEqual([...PINNED_MEMBER_COLUMNS]);
  });

  it("never selects '*'", () => {
    expect(MEMBER_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the members reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAllMembers(client);
      await fetchMembersByIds(client, [UUID_A]);
    });
    expect(calls.get("members")).toEqual([
      PINNED_MEMBER_COLUMNS.join(", "),
      PINNED_MEMBER_COLUMNS.join(", "),
    ]);
  });
});

// ── group_leaders ────────────────────────────────────────────────────────────

const PINNED_GROUP_LEADER_COLUMNS = [
  "id",
  "group_id",
  "profile_id",
  "role",
  "assigned_at",
  "active",
  "created_at",
] as const;

describe("group_leaders read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the group-leaders read must be a deliberate diff here", () => {
    expect([...GROUP_LEADER_COLUMNS.list]).toEqual([
      ...PINNED_GROUP_LEADER_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(GROUP_LEADER_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the group-leaders read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAllGroupLeaders(client);
    });
    expect(calls.get("group_leaders")).toEqual([
      PINNED_GROUP_LEADER_COLUMNS.join(", "),
    ]);
  });
});

// ── group_memberships ────────────────────────────────────────────────────────

const PINNED_GROUP_MEMBERSHIP_COLUMNS = [
  "id",
  "group_id",
  "member_id",
  "role",
  "status",
  "joined_at",
  "ended_at",
  "created_at",
] as const;

describe("group_memberships read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the memberships read must be a deliberate diff here", () => {
    expect([...GROUP_MEMBERSHIP_COLUMNS.list]).toEqual([
      ...PINNED_GROUP_MEMBERSHIP_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(GROUP_MEMBERSHIP_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the memberships read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchActiveMemberships(client);
    });
    expect(calls.get("group_memberships")).toEqual([
      PINNED_GROUP_MEMBERSHIP_COLUMNS.join(", "),
    ]);
  });
});

// ── attendance_sessions / attendance_records ─────────────────────────────────

const PINNED_ATTENDANCE_SESSION_COLUMNS = [
  "id",
  "group_id",
  "meeting_week",
  "meeting_date",
  "status",
  "submitted_by",
  "submitted_at",
  "leader_note",
  "admin_note",
  "created_at",
  "updated_at",
] as const;

const PINNED_ATTENDANCE_RECORD_COLUMNS = [
  "id",
  "session_id",
  "member_id",
  "attendance_status",
  "created_at",
] as const;

describe("attendance read column allowlists (#495)", () => {
  it("pins the exact allowlists — widening the attendance reads must be a deliberate diff here", () => {
    expect([...ATTENDANCE_SESSION_COLUMNS.list]).toEqual([
      ...PINNED_ATTENDANCE_SESSION_COLUMNS,
    ]);
    expect([...ATTENDANCE_RECORD_COLUMNS.list]).toEqual([
      ...PINNED_ATTENDANCE_RECORD_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(ATTENDANCE_SESSION_COLUMNS.list).not.toContain("*");
    expect(ATTENDANCE_RECORD_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlists to the attendance reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAttendanceSessions(client);
      await fetchAttendanceRecordsForSessions(client, [UUID_A]);
    });
    expect(calls.get("attendance_sessions")).toEqual([
      PINNED_ATTENDANCE_SESSION_COLUMNS.join(", "),
    ]);
    expect(calls.get("attendance_records")).toEqual([
      PINNED_ATTENDANCE_RECORD_COLUMNS.join(", "),
    ]);
  });
});

// ── group_health_updates ─────────────────────────────────────────────────────

const PINNED_GROUP_HEALTH_UPDATE_COLUMNS = [
  "id",
  "group_id",
  "submitted_by",
  "update_week",
  "pulse",
  "follow_up_needed",
  "leader_note",
  "admin_note",
  "created_at",
] as const;

describe("group_health_updates read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the health-updates read must be a deliberate diff here", () => {
    expect([...GROUP_HEALTH_UPDATE_COLUMNS.list]).toEqual([
      ...PINNED_GROUP_HEALTH_UPDATE_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(GROUP_HEALTH_UPDATE_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the health-updates read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchLatestHealthUpdates(client);
    });
    expect(calls.get("group_health_updates")).toEqual([
      PINNED_GROUP_HEALTH_UPDATE_COLUMNS.join(", "),
    ]);
  });
});

// ── group_health_assessments ────────────────────────────────────────────────

const PINNED_GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS = [
  "group_id",
  "spiritual_growth_score",
  "group_question_score",
] as const;

describe("group_health_assessments rating read column allowlist", () => {
  it("pins the exact allowlist for checklist rating-gap counts", () => {
    expect([...GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS.list]).toEqual([
      ...PINNED_GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the rating read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchGroupHealthAssessmentRatings(client, {
        periodMonth: "2026-06-01",
      });
    });
    expect(calls.get("group_health_assessments")).toEqual([
      PINNED_GROUP_HEALTH_ASSESSMENT_RATING_COLUMNS.join(", "),
    ]);
  });
});

// ── guests ───────────────────────────────────────────────────────────────────

const PINNED_GUEST_COLUMNS = [
  "id",
  "full_name",
  "email",
  "phone",
  "first_attended_group_id",
  "first_attended_date",
  "pipeline_stage",
  "assigned_group_id",
  "follow_up_owner_id",
  "notes",
  "created_at",
  "updated_at",
] as const;

describe("guests read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the guests read must be a deliberate diff here", () => {
    expect([...GUEST_COLUMNS.list]).toEqual([...PINNED_GUEST_COLUMNS]);
  });

  it("never selects '*'", () => {
    expect(GUEST_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the guests read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchNewGuestsForGroupSince(client, UUID_A, "2026-01-01");
    });
    expect(calls.get("guests")).toEqual([PINNED_GUEST_COLUMNS.join(", ")]);
  });
});

// ── group_calendar_events ────────────────────────────────────────────────────

const PINNED_GROUP_CALENDAR_EVENT_COLUMNS = [
  "id",
  "group_id",
  "event_date",
  "start_time",
  "end_time",
  "event_type",
  "status",
  "title",
  "description",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
  "archived_at",
] as const;

describe("group_calendar_events read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the calendar read must be a deliberate diff here", () => {
    expect([...GROUP_CALENDAR_EVENT_COLUMNS.list]).toEqual([
      ...PINNED_GROUP_CALENDAR_EVENT_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(GROUP_CALENDAR_EVENT_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the calendar read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchGroupCalendarEvents(client);
    });
    expect(calls.get("group_calendar_events")).toEqual([
      PINNED_GROUP_CALENDAR_EVENT_COLUMNS.join(", "),
    ]);
  });
});

// ── app_settings ─────────────────────────────────────────────────────────────

const PINNED_APP_SETTINGS_COLUMNS = [
  "id",
  "setting_key",
  "setting_value",
  "created_at",
  "updated_at",
] as const;

describe("app_settings read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the settings reads must be a deliberate diff here", () => {
    expect([...APP_SETTINGS_COLUMNS.list]).toEqual([
      ...PINNED_APP_SETTINGS_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(APP_SETTINGS_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the keyed settings reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchMetricDefaults(client);
      await fetchGroupHealthRubricSetting(client);
      await fetchLaunchPlanningAssumptions(client);
    });
    expect(calls.get("app_settings")).toEqual([
      PINNED_APP_SETTINGS_COLUMNS.join(", "),
      PINNED_APP_SETTINGS_COLUMNS.join(", "),
      PINNED_APP_SETTINGS_COLUMNS.join(", "),
    ]);
  });
});

// ── group_metric_settings ────────────────────────────────────────────────────

const PINNED_GROUP_METRIC_SETTINGS_COLUMNS = [
  "group_id",
  "capacity_override",
  "capacity_warning_threshold_pct_override",
  "healthy_attendance_pct_override",
  "manual_health_status_override",
  "exclude_from_capacity_metrics",
  "admin_metric_notes",
  "check_in_due_offset_hours_override",
  "allow_over_capacity",
  "created_at",
  "updated_at",
] as const;

describe("group_metric_settings read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the metric-override reads must be a deliberate diff here", () => {
    expect([...GROUP_METRIC_SETTINGS_COLUMNS.list]).toEqual([
      ...PINNED_GROUP_METRIC_SETTINGS_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(GROUP_METRIC_SETTINGS_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the metric-override reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchAllGroupMetricSettings(client);
      await fetchGroupMetricSettings(client, UUID_A);
    });
    expect(calls.get("group_metric_settings")).toEqual([
      PINNED_GROUP_METRIC_SETTINGS_COLUMNS.join(", "),
      PINNED_GROUP_METRIC_SETTINGS_COLUMNS.join(", "),
    ]);
  });
});

// ── audit_events ─────────────────────────────────────────────────────────────

const PINNED_AUDIT_EVENT_COLUMNS = [
  "id",
  "actor_profile_id",
  "action",
  "entity_type",
  "entity_id",
  "metadata",
  "created_at",
  "actor_name",
  "actor_email",
] as const;

describe("audit_events read column allowlist (#495)", () => {
  it("pins the exact allowlist — widening the recent-audit read must be a deliberate diff here", () => {
    expect([...AUDIT_EVENT_COLUMNS.list]).toEqual([
      ...PINNED_AUDIT_EVENT_COLUMNS,
    ]);
  });

  it("never selects '*'", () => {
    expect(AUDIT_EVENT_COLUMNS.list).not.toContain("*");
  });

  it("passes exactly the joined allowlist to the recent-audit read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchRecentAuditEvents(client);
    });
    expect(calls.get("audit_events")).toEqual([
      PINNED_AUDIT_EVENT_COLUMNS.join(", "),
    ]);
  });
});

// ── health_rubrics + rubric grades (#830 M8) ─────────────────────────────────

const PINNED_HEALTH_RUBRIC_COLUMNS = [
  "id",
  "kind",
  "criteria",
  "updated_at",
] as const;

describe("health_rubrics read column allowlist (#830)", () => {
  it("pins the exact allowlist — widening the rubric read must be a deliberate diff here", () => {
    expect([...HEALTH_RUBRIC_COLUMNS.list]).toEqual([
      ...PINNED_HEALTH_RUBRIC_COLUMNS,
    ]);
  });

  it("passes exactly the joined allowlist to the rubric read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchHealthRubric(client, "group");
    });
    expect(calls.get("health_rubrics")).toEqual([
      PINNED_HEALTH_RUBRIC_COLUMNS.join(", "),
    ]);
  });
});

const PINNED_GRADE_ROW_COLUMNS = [
  "ministry_year",
  "criterion_scores",
  "computed_letter",
  "override_letter",
  "override_scope",
  "override_period_month",
  "updated_at",
] as const;

describe("rubric-grade single-row read column allowlists (#830)", () => {
  it("pins the exact allowlists — widening a grade read must be a deliberate diff here", () => {
    expect([...GROUP_RUBRIC_GRADE_COLUMNS.list]).toEqual([
      "group_id",
      ...PINNED_GRADE_ROW_COLUMNS,
    ]);
    expect([...LEADER_RUBRIC_GRADE_COLUMNS.list]).toEqual([
      "profile_id",
      ...PINNED_GRADE_ROW_COLUMNS,
    ]);
  });

  it("passes exactly the joined allowlists to the single-row grade reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchGroupRubricGradeRow(client, UUID_A, 2026);
      await fetchLeaderRubricGradeRow(client, UUID_A, 2026);
    });
    expect(calls.get("group_rubric_grades")).toEqual([
      GROUP_RUBRIC_GRADE_COLUMNS.select,
    ]);
    expect(calls.get("leader_rubric_grades")).toEqual([
      LEADER_RUBRIC_GRADE_COLUMNS.select,
    ]);
  });
});

const PINNED_GRADE_YEAR_COLUMNS = [
  "criterion_scores",
  "override_letter",
  "override_scope",
  "override_period_month",
] as const;

describe("care-accordion grade-year read column allowlists (#830)", () => {
  it("pins the exact allowlists — the year readers stay narrower than the single-row reads", () => {
    expect([...ADMIN_GROUP_RUBRIC_GRADE_YEAR_COLUMNS.list]).toEqual([
      "group_id",
      ...PINNED_GRADE_YEAR_COLUMNS,
    ]);
    expect([...ADMIN_LEADER_RUBRIC_GRADE_YEAR_COLUMNS.list]).toEqual([
      "profile_id",
      ...PINNED_GRADE_YEAR_COLUMNS,
    ]);
  });

  it("passes exactly the joined allowlists to the year reads", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchGroupRubricGradesForYear(client, 2026);
      await fetchLeaderRubricGradesForYear(client, 2026);
    });
    expect(calls.get("group_rubric_grades")).toEqual([
      ADMIN_GROUP_RUBRIC_GRADE_YEAR_COLUMNS.select,
    ]);
    expect(calls.get("leader_rubric_grades")).toEqual([
      ADMIN_LEADER_RUBRIC_GRADE_YEAR_COLUMNS.select,
    ]);
  });
});

// ── #830 M9: allowlists migrated off raw select strings ─────────────────────
//
// These allowlists are module-local columns<Row>() sets, so the pin asserts
// the select string each live fetcher passes — the same freeze the exported
// families get above, without re-exporting constants nobody consumes.

describe("raw-string allowlist migrations pass pinned selects (#830 M9)", () => {
  it("guest directory read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchGuests(client);
    });
    expect(calls.get("guests")).toEqual([
      "id, full_name, email, phone, first_attended_group_id, " +
        "first_attended_date, pipeline_stage, assigned_group_id, " +
        "follow_up_owner_id, notes, created_at",
    ]);
  });

  it("leader-safe group read stays admin_notes-free", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchLeaderGroupsByIds(client, [UUID_A]);
    });
    expect(calls.get("groups")).toEqual([
      "id, name, lifecycle_status, meeting_day, meeting_time, " +
        "meeting_frequency, meeting_week_parity",
    ]);
    expect(String(calls.get("groups")?.[0])).not.toContain("admin_notes");
  });

  it("group-ref picker read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchGroupRefs(client);
    });
    expect(calls.get("groups")).toEqual([
      "id, name, lifecycle_status, group_type",
    ]);
  });

  it("settings reads: group-type configs, church attendance, scenarios", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchGroupTypeConfigs(client);
      await fetchChurchAttendanceSnapshots(client);
      await fetchLaunchPlanningScenariosForAdmin(client);
    });
    expect(calls.get("group_type_configs")).toEqual([
      "group_type, target_count, readiness_rule, in_pipeline",
    ]);
    expect(calls.get("church_attendance_snapshots")).toEqual([
      "id, snapshot_date, attendance_count, note, created_by_profile_id, " +
        "created_at, updated_at",
    ]);
    expect(calls.get("launch_planning_scenarios")).toEqual([
      "id, name, description, assumptions, is_current, archived_at, " +
        "created_by, updated_by, created_at, updated_at",
    ]);
  });

  it("multiplication reads: candidates, pipeline, picker", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchMultiplicationCandidatesForAdmin(client);
      await fetchLeaderPipelineForAdmin(client);
      await fetchApprenticePickerRefs(client);
    });
    expect(calls.get("multiplication_candidates")).toEqual([
      "id, group_id, target_year, status, shepherd_willing, " +
        "needs_similar_stage, enough_members, established_long_enough, " +
        "co_shepherd_tenured, notes, successor_designate, meeting_time, " +
        "leader_pipeline_id, manual_member_count, archived_at, created_by, " +
        "updated_by, created_at, updated_at",
    ]);
    expect(calls.get("leader_pipeline")).toEqual([
      "id, group_id, display_name, member_id, readiness_stage, " +
        "expected_ready_on, notes, archived_at, created_by, updated_by, " +
        "created_at, updated_at",
      "id, group_id, display_name, readiness_stage",
    ]);
  });

  it("super-admin usage-events read", async () => {
    const calls = await captureSelects(async (client) => {
      await fetchRecentUsageEvents(client);
    });
    expect(calls.get("usage_events")).toEqual([
      "id, actor_profile_id, event_type, area, created_at",
    ]);
  });
});
