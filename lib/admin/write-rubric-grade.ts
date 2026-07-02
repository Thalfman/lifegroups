import "server-only";

// Deep write module for the rubric-driven health grades (#791). It owns the one
// pipeline both the Group-Health Grade and the Leader-Health Grade writes share:
//   read the configured rubric → recompute the A–F letter SERVER-SIDE via the
//   pure facade → map the seven p_* args → call the audited SECURITY DEFINER RPC.
// Pulling this behind one interface keyed by a "group" | "leader" discriminator
// keeps the action specs declarative: the action's `rpc` field becomes a one-line
// delegation here, and the rubric-read / recompute / arg-mapping locality lives
// in this module rather than leaking into the run-action spec.
//
// The persisted computed_letter is always the engine's output (never a client-
// supplied letter): the facade rolls the criterion scores up over the server's
// rubric, and the override letter/scope/period are carried through unchanged. The
// write still goes through the narrow audited RPC, so the write-path invariants
// hold.
//
// Both the GROUP and LEADER adapters are wired: the Group-Health Grade and the
// Leader-Health Grade actions each delegate their spec `rpc` field here, so the
// "recompute over the configured rubric, then persist via the audited RPC" rule
// lives in exactly one place for both grades. The two grades stay distinct
// concepts — each reads its own rubric (by kind), resolves through its own pure
// facade, and calls its own RPC; the module shares the pipeline shape, not the
// rubric or the letters.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { UuidRpcResult } from "@/lib/shared/rpc";
import { adminRpc } from "@/lib/admin/rpc";
import { decodeRubricCriteria, type Rubric } from "@/lib/admin/health-rubric";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";
import { fetchHealthRubric } from "@/lib/supabase/rubric-grade-reads";
import { currentPeriodMonthIso } from "@/lib/admin/ministry-year";
import type {
  GroupRubricGradePayload,
  LeaderHealthGradePayload,
} from "@/lib/admin/validation";

// The two rubric-grade kinds. The Group-Health Grade and the Leader-Health Grade
// are distinct concepts (CONTEXT.md) that nonetheless share this write pipeline.
export type RubricGradeKind = "group" | "leader";

// The validated payload each kind hands the module. Keyed by the discriminator
// so `writeRubricGrade(client, "group", value)` pins the value shape.
type RubricGradePayloadByKind = {
  group: GroupRubricGradePayload;
  leader: LeaderHealthGradePayload;
};

// A per-kind adapter: resolve the letter via the kind's pure facade, map the
// p_* args, and invoke the kind's audited RPC. Each adapter is self-contained so
// the literal RPC name and its argument shape stay pinned together (no union
// widening across kinds). The orchestrator owns the uniform rubric read + period
// key, so the adapter only sees the decoded rubric and the resolved period.
type RubricGradeAdapter<K extends RubricGradeKind> = {
  call: (
    client: AppSupabaseClient,
    value: RubricGradePayloadByKind[K],
    rubric: Rubric,
    periodMonth: string
  ) => Promise<UuidRpcResult>;
};

const groupAdapter: RubricGradeAdapter<"group"> = {
  call: (client, value, rubric, periodMonth) => {
    // Recompute the effective letter via the pure facade so the persisted
    // computed_letter is the engine's output, never a client-supplied letter.
    const resolved = resolveGroupRubricGrade({
      rubric,
      scores: value.criterion_scores,
      override:
        value.override_letter && value.override_scope
          ? { letter: value.override_letter, scope: value.override_scope }
          : null,
      periodMonth,
    });

    return adminRpc(client, "admin_set_group_rubric_grade", {
      p_group_id: value.group_id,
      p_ministry_year: value.ministry_year,
      p_criterion_scores: value.criterion_scores,
      // The engine's computed letter (pre-override) — the Multiplication pillar
      // source. The override is persisted separately below.
      p_computed_letter: resolved.computed_letter,
      p_override_letter: value.override_letter,
      p_override_scope: value.override_scope,
      // A this-month override expires by the month it was set for; persist that
      // month so the read-time resolution can apply the scope. Null when there
      // is no override.
      p_override_period_month:
        value.override_letter && value.override_scope ? periodMonth : null,
    });
  },
};

const leaderAdapter: RubricGradeAdapter<"leader"> = {
  call: (client, value, rubric, periodMonth) => {
    // Symmetric to the group adapter, through the Leader-Health Grade's own
    // facade. resolveLeaderGrade takes the override as the shared GradeOverride
    // shape (letter + scope + the period it was set for) and additionally keys on
    // the ministry year, so the persisted computed_letter is the engine's output
    // over the LEADER rubric, never a client-supplied letter.
    const resolved = resolveLeaderGrade({
      rubric,
      scores: value.criterion_scores,
      override:
        value.override_letter && value.override_scope
          ? {
              letter: value.override_letter,
              scope: value.override_scope,
              period_month: periodMonth,
            }
          : null,
      ministryYear: value.ministry_year,
      currentPeriodMonth: periodMonth,
    });

    return adminRpc(client, "admin_set_leader_rubric_grade", {
      p_profile_id: value.profile_id,
      p_ministry_year: value.ministry_year,
      p_criterion_scores: value.criterion_scores,
      // The engine's computed letter (pre-override) — the Multiplication "Leader
      // Health" pillar source. The override is persisted separately below.
      p_computed_letter: resolved.computed_letter,
      p_override_letter: value.override_letter,
      p_override_scope: value.override_scope,
      // A this-month override expires by the month it was set for; persist that
      // month so read-time resolution can apply the scope. Null when no override.
      p_override_period_month:
        value.override_letter && value.override_scope ? periodMonth : null,
    });
  },
};

// Both rubric-grade kinds are wired: the second adapter (leader) is the real
// consumer that turns the seam from hypothetical into real. Kept as a partial map
// so the orchestrator's not-wired guard stays as defensive code (now unreachable
// for either kind).
const ADAPTERS: { [K in RubricGradeKind]?: RubricGradeAdapter<K> } = {
  group: groupAdapter,
  leader: leaderAdapter,
};

// Run the rubric-grade write pipeline for a kind: read the configured rubric,
// recompute the letter server-side, map the args, and call the audited RPC.
// Returns the RPC result so the action's spec `rpc` field is a one-line
// delegation. A rubric read failure short-circuits with `rubric_read_failed`
// before any write, so a stale or unreadable rubric can never grade.
export async function writeRubricGrade<K extends RubricGradeKind>(
  client: AppSupabaseClient,
  kind: K,
  value: RubricGradePayloadByKind[K]
): Promise<UuidRpcResult> {
  const adapter = ADAPTERS[kind];
  if (!adapter)
    return {
      data: null,
      error: { message: `rubric_grade_kind_not_wired:${kind}` },
    };

  // Uniform read: both kinds read health_rubrics by kind and decode identically.
  const rubricRes = await fetchHealthRubric(client, kind);
  if (rubricRes.error)
    return { data: null, error: { message: "rubric_read_failed" } };
  const rubric: Rubric = {
    criteria: decodeRubricCriteria(rubricRes.data?.criteria ?? null),
  };

  return adapter.call(client, value, rubric, currentPeriodMonthIso());
}
