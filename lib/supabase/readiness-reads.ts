import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// Readiness rule read model. One allowlisted read feeds the Settings readiness
// editor + Multiply: the single GLOBAL rule for the current ministry year. RLS
// restricts SELECT to admins — never select("*"). Per-type overrides live on
// group_type_configs (read via fetchGroupTypeConfigs). The rule's `rule` jsonb is
// decoded into a typed ReadinessRule at the trust boundary
// (lib/admin/cell-readiness.ts); the row type here stays raw.

// One persisted global-rule row, as read through the allowlist. The `rule` field
// is raw jsonb; the caller decodes it with decodeReadinessRule. The allowlist
// below is pinned to this type via `columns<…>()`.
export type ReadinessRuleRow = {
  id: string;
  ministry_year: number;
  rule: unknown;
  updated_at: string;
};

export const READINESS_RULE_COLUMNS = columns<ReadinessRuleRow>()(
  "id",
  "ministry_year",
  "rule",
  "updated_at"
);

// Fetch the global readiness rule for a ministry year (at most one row). A null
// result is the success-with-empty case — a fresh ministry has no rule until
// Julian sets one; the editor + evaluator fall back to the built-in rule.
export async function fetchReadinessRule(
  client: ReadClient,
  ministryYear: number
): Promise<ReadResult<ReadinessRuleRow | null>> {
  const { data, error } = await client
    .from("multiplication_readiness_rule")
    .select(READINESS_RULE_COLUMNS.select)
    .eq("ministry_year", ministryYear)
    .maybeSingle<ReadinessRuleRow>();

  if (error)
    return {
      data: null,
      error: wrapError("multiplication_readiness_rule", error),
    };
  return { data: data ?? null, error: null };
}
