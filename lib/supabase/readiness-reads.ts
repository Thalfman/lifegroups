import type { GroupAudienceCategory } from "@/types/enums";
import { wrapError, type ReadClient, type ReadResult } from "./read-core";

// Per-cell readiness rule read model (#402 / PRD §2.4). One allowlisted read feeds
// the Settings > Groups readiness editor: the GLOBAL rule for the current ministry
// year. RLS already restricts SELECT to admins (belt-and-braces, matching the
// multiplication-config + group-categories reads idiom) — never select("*").
//
// The per-cell OVERRIDES are not read here: they live on category_type_targets
// and are read alongside the coverage cells via fetchCategoryTypeTargetCells
// (which now projects trigger_overrides). The rule's `rule` jsonb is decoded into
// a typed ReadinessRule at the trust boundary (lib/admin/cell-readiness.ts); the
// row type here stays raw.

export const READINESS_RULE_COLUMNS = "id, ministry_year, rule, updated_at";

// One persisted global-rule row, as read through the allowlist. The `rule` field
// is raw jsonb; the caller decodes it with decodeReadinessRule.
export type ReadinessRuleRow = {
  id: string;
  ministry_year: number;
  rule: unknown;
  updated_at: string;
};

// Fetch the global readiness rule for a ministry year (at most one row). A null
// result is the success-with-empty case — a fresh ministry has no rule until
// Julian sets one; the editor + evaluator fall back to the built-in rule.
export async function fetchReadinessRule(
  client: ReadClient,
  ministryYear: number
): Promise<ReadResult<ReadinessRuleRow | null>> {
  const { data, error } = await client
    .from("multiplication_readiness_rule")
    .select(READINESS_RULE_COLUMNS)
    .eq("ministry_year", ministryYear)
    .maybeSingle<ReadinessRuleRow>();

  if (error)
    return {
      data: null,
      error: wrapError("multiplication_readiness_rule", error),
    };
  return { data: data ?? null, error: null };
}

// Per-TYPE readiness rule read model (#410 / ADR 0021) — the MIDDLE tier of the
// global → per-type → per-cell cascade. One allowlisted read returns every
// per-type rule for a ministry year (at most one per Audience: Men's / Women's /
// Mixed). RLS already restricts SELECT to admins; never select("*"). Each row's
// `rule` jsonb is a PARTIAL of the global rule, decoded into a typed
// PerTypeReadinessRule at the trust boundary (lib/admin/cell-readiness.ts).

export const AUDIENCE_READINESS_RULE_COLUMNS =
  "id, ministry_year, audience_category, rule, updated_at";

// One persisted per-type rule row, as read through the allowlist. The `rule` field
// is raw jsonb; the caller decodes it with decodePerTypeRule.
export type AudienceReadinessRuleRow = {
  id: string;
  ministry_year: number;
  audience_category: GroupAudienceCategory;
  rule: unknown;
  updated_at: string;
};

// Fetch every per-type readiness rule for a ministry year (0–3 rows). An empty
// result is the success-with-empty case — until a per-type rule is set, every type
// inherits the global rule (the additive default per ADR 0021).
export async function fetchAudienceReadinessRules(
  client: ReadClient,
  ministryYear: number
): Promise<ReadResult<AudienceReadinessRuleRow[]>> {
  const { data, error } = await client
    .from("audience_readiness_rule")
    .select(AUDIENCE_READINESS_RULE_COLUMNS)
    .eq("ministry_year", ministryYear)
    .returns<AudienceReadinessRuleRow[]>();

  if (error)
    return {
      data: null,
      error: wrapError("audience_readiness_rule", error),
    };
  return { data: data ?? [], error: null };
}
