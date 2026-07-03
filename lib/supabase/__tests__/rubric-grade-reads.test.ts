import { describe, expect, it } from "vitest";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchGroupRubricGradeRow,
  fetchLeaderRubricGradeRow,
  GROUP_RUBRIC_GRADE_COLUMNS,
  LEADER_RUBRIC_GRADE_COLUMNS,
} from "@/lib/supabase/rubric-grade-reads";

// Pins the trust-boundary decode on the persisted grade readers (#830 C2):
// both single-row readers run raw jsonb `criterion_scores` through
// `decodeNumericRecord`, so malformed values are dropped at the read seam —
// no reader hands raw jsonb to the grade resolvers.

const UUID_A = "11111111-1111-1111-1111-111111111111";

type Capture = { table: string | null; select: unknown };

// Minimal stub for the `.from(t).select(...).eq(...).eq(...).maybeSingle()`
// chain these readers use, resolving to the provided row (or error).
function makeMaybeSingleClient(
  capture: Capture,
  result: { data: unknown; error: Error | null }
): AppSupabaseClient {
  const builder = {
    select(cols: unknown) {
      capture.select = cols;
      return builder;
    },
    eq: () => builder,
    maybeSingle: async () => result,
  };
  return {
    from(table: string) {
      capture.table = table;
      return builder;
    },
  } as unknown as AppSupabaseClient;
}

function emptyCapture(): Capture {
  return { table: null, select: null };
}

const GRADE_FIELDS = {
  computed_letter: "B",
  override_letter: null,
  override_scope: null,
  override_period_month: null,
  updated_at: "2026-07-01T00:00:00Z",
};

describe("fetchGroupRubricGradeRow — trust-boundary decode (#830 C2)", () => {
  it("decodes dirty jsonb criterion_scores, dropping non-numeric values", async () => {
    const capture = emptyCapture();
    const client = makeMaybeSingleClient(capture, {
      data: {
        group_id: UUID_A,
        ministry_year: 2026,
        criterion_scores: { a: 1, b: "85", c: null },
        ...GRADE_FIELDS,
      },
      error: null,
    });
    const res = await fetchGroupRubricGradeRow(client, UUID_A, 2026);
    expect(res.error).toBeNull();
    expect(res.data?.criterion_scores).toEqual({ a: 1 });
  });

  it("decodes a null criterion_scores to an empty record", async () => {
    const capture = emptyCapture();
    const client = makeMaybeSingleClient(capture, {
      data: {
        group_id: UUID_A,
        ministry_year: 2026,
        criterion_scores: null,
        ...GRADE_FIELDS,
      },
      error: null,
    });
    const res = await fetchGroupRubricGradeRow(client, UUID_A, 2026);
    expect(res.data?.criterion_scores).toEqual({});
  });

  it("treats a missing row as success-with-null, not an error", async () => {
    const client = makeMaybeSingleClient(emptyCapture(), {
      data: null,
      error: null,
    });
    const res = await fetchGroupRubricGradeRow(client, UUID_A, 2026);
    expect(res).toEqual({ data: null, error: null });
  });

  it("selects exactly the pinned allowlist from group_rubric_grades", async () => {
    const capture = emptyCapture();
    const client = makeMaybeSingleClient(capture, { data: null, error: null });
    await fetchGroupRubricGradeRow(client, UUID_A, 2026);
    expect(capture.table).toBe("group_rubric_grades");
    expect(capture.select).toBe(GROUP_RUBRIC_GRADE_COLUMNS.select);
    expect(GROUP_RUBRIC_GRADE_COLUMNS.select).not.toContain("*");
  });
});

describe("fetchLeaderRubricGradeRow — trust-boundary decode (mirror)", () => {
  it("decodes dirty jsonb criterion_scores, dropping non-numeric values", async () => {
    const capture = emptyCapture();
    const client = makeMaybeSingleClient(capture, {
      data: {
        profile_id: UUID_A,
        ministry_year: 2026,
        criterion_scores: { a: 2, b: Number.NaN, c: "x" },
        ...GRADE_FIELDS,
      },
      error: null,
    });
    const res = await fetchLeaderRubricGradeRow(client, UUID_A, 2026);
    expect(res.error).toBeNull();
    expect(res.data?.criterion_scores).toEqual({ a: 2 });
  });

  it("selects exactly the pinned allowlist from leader_rubric_grades", async () => {
    const capture = emptyCapture();
    const client = makeMaybeSingleClient(capture, { data: null, error: null });
    await fetchLeaderRubricGradeRow(client, UUID_A, 2026);
    expect(capture.table).toBe("leader_rubric_grades");
    expect(capture.select).toBe(LEADER_RUBRIC_GRADE_COLUMNS.select);
    expect(LEADER_RUBRIC_GRADE_COLUMNS.select).not.toContain("*");
  });
});
