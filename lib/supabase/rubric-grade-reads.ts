import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  GroupHealthLetter,
  GroupHealthOverrideScope,
  LeaderHealthLetter,
} from "@/types/enums";
import {
  columns,
  decodeNumericRecord,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// The three rubric/grade readers — the Health Rubric definition plus the
// persisted Group-Health and Leader-Health Grade rows — consolidated as sibling
// functions so grade decoding has one home. Deliberately NOT a unified fetcher:
// each reader keeps its own row shape and output type (ADR 0011 forbids
// unifying output models).

// Health Rubric read model (#374 / ADR 0018). Column-allowlisted read of the
// current rubric for a kind — never select("*") on the table, even though its
// RLS already restricts SELECT to admins (belt-and-braces, matching the
// shepherd-care reads idiom). The row type is defined locally here rather than
// widening types/database.ts, since this is the only reader of the table.

// One persisted rubric row, as read through the allowlist. `criteria` is the raw
// jsonb array; the caller decodes it into RubricCriterion[] at the trust
// boundary (lib/admin/health-rubric.ts). The allowlist below is pinned to this
// type via `columns<…>()`, so the select string and the row type derive from one
// list — adding a column to the read is a typed diff against this shape.
export type HealthRubricRow = {
  id: string;
  kind: "group" | "leader";
  criteria: unknown;
  updated_at: string;
};

// Admin-only column allowlist for health_rubrics, pinned to HealthRubricRow.
export const HEALTH_RUBRIC_COLUMNS = columns<HealthRubricRow>()(
  "id",
  "kind",
  "criteria",
  "updated_at"
);

// Fetch the current rubric for a kind, or null when none has been saved yet
// (a fresh ministry has no rubric until Julian builds one). Missing-row is the
// success-with-null case, not an error.
export async function fetchHealthRubric(
  client: ReadClient,
  kind: "group" | "leader"
): Promise<ReadResult<HealthRubricRow | null>> {
  const { data, error } = await client
    .from("health_rubrics")
    .select(HEALTH_RUBRIC_COLUMNS.select)
    .eq("kind", kind)
    .maybeSingle();

  if (error) return { data: null, error: wrapError("health_rubrics", error) };
  return { data: (data as HealthRubricRow | null) ?? null, error: null };
}

// Read side for the persisted Group-Health Grade row (#377 / ADR 0018), behind
// the reads seam (ADR 0015): the surface that needs it binds this through
// `bindReads`, and its tests inject an in-memory adapter satisfying the same
// interface. Admin-only data — runs under the admin layout guard and the table's
// admin-only RLS. Column-allowlisted (named columns, never select("*")). The
// table is in the typed schema (types/database.ts › group_rubric_grades), so the
// select is fully typed — no `as never` cast. Resolution into an effective
// letter stays in the model (lib/admin/group-rubric-grade), keeping this pure I/O.

// One persisted Group-Health Grade row after the trust-boundary decode: the
// raw jsonb `criterion_scores` is decoded to a clean Record here, mirroring
// the leader reader below. Resolution into an effective letter stays in the
// model (lib/admin/group-rubric-grade).
export type GroupRubricGradeRow = {
  group_id: string;
  ministry_year: number;
  criterion_scores: Record<string, number>;
  computed_letter: GroupHealthLetter | null;
  override_letter: GroupHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
  updated_at: string | null;
};

// The raw row shape before the trust-boundary decode (criterion_scores is
// jsonb). The allowlist below is pinned to this type via `columns<…>()`, so the
// select string and the row type derive from one list.
export type PersistedGroupGrade = {
  group_id: string;
  ministry_year: number;
  criterion_scores: unknown;
  computed_letter: GroupHealthLetter | null;
  override_letter: GroupHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
  updated_at: string | null;
};

// Admin-only column allowlist, pinned to the raw read shape.
export const GROUP_RUBRIC_GRADE_COLUMNS = columns<PersistedGroupGrade>()(
  "group_id",
  "ministry_year",
  "criterion_scores",
  "computed_letter",
  "override_letter",
  "override_scope",
  "override_period_month",
  "updated_at"
);

// Fetch a group's persisted rubric grade row for a ministry year, or null when
// none has been entered yet (success-with-null, not an error).
export async function fetchGroupRubricGradeRow(
  client: AppSupabaseClient,
  groupId: string,
  ministryYear: number
): Promise<ReadResult<GroupRubricGradeRow | null>> {
  const { data, error } = await client
    .from("group_rubric_grades")
    .select(GROUP_RUBRIC_GRADE_COLUMNS.select)
    .eq("group_id", groupId)
    .eq("ministry_year", ministryYear)
    .maybeSingle<PersistedGroupGrade>();

  if (error)
    return { data: null, error: wrapError("fetchGroupRubricGradeRow", error) };
  if (!data) return { data: null, error: null };

  return {
    data: {
      group_id: data.group_id,
      ministry_year: data.ministry_year,
      criterion_scores: decodeNumericRecord(data.criterion_scores),
      computed_letter: data.computed_letter,
      override_letter: data.override_letter,
      override_scope: data.override_scope,
      override_period_month: data.override_period_month,
      updated_at: data.updated_at,
    },
    error: null,
  };
}

// Read side for the persisted Leader-Health Grade row (#378 / ADR 0018), behind
// the reads seam (ADR 0015). Admin-only data — runs under the admin layout guard
// and the table's admin-only RLS. Column-allowlisted (named columns, never
// select("*")). The table is in the typed schema (types/database.ts ›
// leader_rubric_grades), so the select is fully typed — no `as never` cast. The
// raw jsonb `criterion_scores` is decoded to a clean Record at the trust
// boundary here; the effective-letter resolution lives in the model.

// One persisted Leader-Health Grade row, as read through the column allowlist.
export type LeaderRubricGradeRow = {
  profile_id: string;
  ministry_year: number;
  criterion_scores: Record<string, number>;
  computed_letter: LeaderHealthLetter | null;
  override_letter: LeaderHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
  updated_at: string | null;
};

// The raw row shape before the trust-boundary decode (criterion_scores is jsonb).
export type PersistedLeaderGrade = {
  profile_id: string;
  ministry_year: number;
  criterion_scores: unknown;
  computed_letter: LeaderHealthLetter | null;
  override_letter: LeaderHealthLetter | null;
  override_scope: GroupHealthOverrideScope | null;
  override_period_month: string | null;
  updated_at: string | null;
};

// Admin-only column allowlist, pinned to the raw read shape so the select string
// and the row type derive from one list.
export const LEADER_RUBRIC_GRADE_COLUMNS = columns<PersistedLeaderGrade>()(
  "profile_id",
  "ministry_year",
  "criterion_scores",
  "computed_letter",
  "override_letter",
  "override_scope",
  "override_period_month",
  "updated_at"
);

// Fetch a leader's persisted Leader-Health Grade for a ministry year, or null
// when none has been entered yet (the success-with-null case, not an error).
export async function fetchLeaderRubricGradeRow(
  client: AppSupabaseClient,
  profileId: string,
  ministryYear: number
): Promise<ReadResult<LeaderRubricGradeRow | null>> {
  const { data, error } = await client
    .from("leader_rubric_grades")
    .select(LEADER_RUBRIC_GRADE_COLUMNS.select)
    .eq("profile_id", profileId)
    .eq("ministry_year", ministryYear)
    .maybeSingle<PersistedLeaderGrade>();

  if (error)
    return { data: null, error: wrapError("fetchLeaderRubricGradeRow", error) };
  if (!data) return { data: null, error: null };

  return {
    data: {
      profile_id: data.profile_id,
      ministry_year: data.ministry_year,
      criterion_scores: decodeNumericRecord(data.criterion_scores),
      computed_letter: data.computed_letter,
      override_letter: data.override_letter,
      override_scope: data.override_scope,
      override_period_month: data.override_period_month,
      updated_at: data.updated_at,
    },
    error: null,
  };
}
