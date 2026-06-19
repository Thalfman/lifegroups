import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

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
