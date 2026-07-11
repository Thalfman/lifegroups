import { beforeEach, describe, expect, it, vi } from "vitest";

// Deep write module for the rubric-driven health grades (#791). These tests
// exercise writeRubricGrade DIRECTLY — rubric read result → server-side resolved
// letter → mapped p_* args → audited RPC — complementing the action/validation
// coverage. The rubric read is mocked so the test feeds a known rubric; the RPC
// is observed through a fake client whose `rpc` spy captures the mapped args.

const { mockFetchHealthRubric } = vi.hoisted(() => ({
  mockFetchHealthRubric: vi.fn(),
}));

vi.mock("@/lib/supabase/rubric-grade-reads", () => ({
  fetchHealthRubric: mockFetchHealthRubric,
}));

import { writeRubricGrade } from "@/lib/admin/write-rubric-grade";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";
import type {
  GroupRubricGradePayload,
  LeaderHealthGradePayload,
} from "@/lib/admin/validation";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const GROUP_ID = "11111111-1111-1111-1111-111111111111";
const PROFILE_ID = "33333333-3333-3333-3333-333333333333";
const NEW_ID = "22222222-2222-2222-2222-222222222222";

// A known rubric: 60/40 split. With attendance 80, unity 90 the engine rolls up
// to 84 -> "B" (mirrors the facade's own integration test).
const RUBRIC_CRITERIA = [
  { key: "attendance", label: "Attendance", weight: 60 },
  { key: "unity", label: "Unity", weight: 40 },
];

function rubricRow() {
  return {
    data: {
      id: "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr",
      kind: "group" as const,
      criteria: RUBRIC_CRITERIA,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  };
}

// The Leader-Health Rubric the leader path reads — same 60/40 split so the
// engine again rolls 80/90 up to 84 -> "B", but tagged with the "leader" kind.
function leaderRubricRow() {
  return {
    data: {
      id: "llllllll-llll-llll-llll-llllllllllll",
      kind: "leader" as const,
      criteria: RUBRIC_CRITERIA,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  };
}

// Fake client whose `rpc` spy captures the name + args writeRubricGrade maps.
function fakeClient() {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: NEW_ID,
    error: null,
  }));
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

function payload(
  overrides: Partial<GroupRubricGradePayload> = {}
): GroupRubricGradePayload {
  return {
    group_id: GROUP_ID,
    ministry_year: 2025,
    criterion_scores: { attendance: 80, unity: 90 },
    override_letter: null,
    override_scope: null,
    ...overrides,
  };
}

function leaderPayload(
  overrides: Partial<LeaderHealthGradePayload> = {}
): LeaderHealthGradePayload {
  return {
    profile_id: PROFILE_ID,
    ministry_year: 2025,
    criterion_scores: { attendance: 80, unity: 90 },
    override_letter: null,
    override_scope: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchHealthRubric.mockResolvedValue(rubricRow());
});

describe("writeRubricGrade — group", () => {
  it("reads the rubric, recomputes the letter, and maps the args (no override)", async () => {
    const { client, rpc } = fakeClient();

    const result = await writeRubricGrade(client, "group", payload());

    // The read was scoped to the group kind.
    expect(mockFetchHealthRubric).toHaveBeenCalledWith(client, "group");

    // The audited RPC was invoked with the mapped args.
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("admin_set_group_rubric_grade");
    expect(args).toMatchObject({
      p_group_id: GROUP_ID,
      p_ministry_year: 2025,
      p_criterion_scores: { attendance: 80, unity: 90 },
      // 80*0.6 + 90*0.4 = 84 -> the engine's "B".
      p_computed_letter: "B",
      p_override_letter: null,
      p_override_scope: null,
      p_override_period_month: null,
    });

    expect(result).toEqual({ data: NEW_ID, error: null });
  });

  it("persists the ENGINE letter, not the override, and keys the override period", async () => {
    const { rpc, client } = fakeClient();
    const scores = { attendance: 80, unity: 90 }; // engine -> "B"

    await writeRubricGrade(
      client,
      "group",
      payload({
        criterion_scores: scores,
        // Override to "A" — must NOT become the persisted computed_letter.
        override_letter: "A",
        override_scope: "until_cleared",
      })
    );

    const [, args] = rpc.mock.calls[0];
    // computed_letter is the rubric's output (cross-checked against the facade),
    // never the client-supplied override.
    const engine = resolveGroupRubricGrade({
      rubric: { criteria: RUBRIC_CRITERIA },
      scores,
      periodMonth: currentPeriodMonthIso(),
    });
    expect(args.p_computed_letter).toBe(engine.computed_letter);
    expect(args.p_computed_letter).toBe("B");
    expect(args.p_computed_letter).not.toBe("A");
    // The override letter/scope are carried through unchanged.
    expect(args.p_override_letter).toBe("A");
    expect(args.p_override_scope).toBe("until_cleared");
    // The override period is the current period month so read-time resolution
    // can apply the scope.
    expect(args.p_override_period_month).toBe(currentPeriodMonthIso());
  });

  it("short-circuits with rubric_read_failed before writing when the read errors", async () => {
    mockFetchHealthRubric.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const { client, rpc } = fakeClient();

    const result = await writeRubricGrade(client, "group", payload());

    expect(result).toEqual({
      data: null,
      error: { message: "rubric_read_failed" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("writeRubricGrade — leader", () => {
  beforeEach(() => {
    // The leader path reads the Leader-Health Rubric.
    mockFetchHealthRubric.mockResolvedValue(leaderRubricRow());
  });

  it("reads the leader rubric, recomputes the letter, and maps the args (no override)", async () => {
    const { client, rpc } = fakeClient();

    const result = await writeRubricGrade(client, "leader", leaderPayload());

    // The read was scoped to the leader kind — its own distinct rubric.
    expect(mockFetchHealthRubric).toHaveBeenCalledWith(client, "leader");

    // The leader's own audited RPC was invoked with the mapped args.
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("admin_set_leader_rubric_grade");
    expect(args).toMatchObject({
      p_profile_id: PROFILE_ID,
      p_ministry_year: 2025,
      p_criterion_scores: { attendance: 80, unity: 90 },
      // 80*0.6 + 90*0.4 = 84 -> the engine's "B".
      p_computed_letter: "B",
      p_override_letter: null,
      p_override_scope: null,
      p_override_period_month: null,
    });

    expect(result).toEqual({ data: NEW_ID, error: null });
  });

  it("persists the ENGINE letter, not the override, and keys the override period", async () => {
    const { rpc, client } = fakeClient();
    const scores = { attendance: 80, unity: 90 }; // engine -> "B"

    await writeRubricGrade(
      client,
      "leader",
      leaderPayload({
        criterion_scores: scores,
        // Override to "A" — must NOT become the persisted computed_letter.
        override_letter: "A",
        override_scope: "until_cleared",
      })
    );

    const [, args] = rpc.mock.calls[0];
    // computed_letter is the rubric's output (cross-checked against the leader
    // facade), never the client-supplied override.
    const engine = resolveLeaderGrade({
      rubric: { criteria: RUBRIC_CRITERIA },
      scores,
      override: null,
      ministryYear: 2025,
      currentPeriodMonth: currentPeriodMonthIso(),
    });
    expect(args.p_computed_letter).toBe(engine.computed_letter);
    expect(args.p_computed_letter).toBe("B");
    expect(args.p_computed_letter).not.toBe("A");
    // The override letter/scope are carried through unchanged.
    expect(args.p_override_letter).toBe("A");
    expect(args.p_override_scope).toBe("until_cleared");
    // The override period is the current period month so read-time resolution
    // can apply the scope.
    expect(args.p_override_period_month).toBe(currentPeriodMonthIso());
  });

  it("short-circuits with rubric_read_failed before writing when the read errors", async () => {
    mockFetchHealthRubric.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const { client, rpc } = fakeClient();

    const result = await writeRubricGrade(client, "leader", leaderPayload());

    expect(result).toEqual({
      data: null,
      error: { message: "rubric_read_failed" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
