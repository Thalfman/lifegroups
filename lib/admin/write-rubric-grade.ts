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
// This slice wires the GROUP adapter only. The Leader adapter follows in its own
// slice — the second real consumer that proves the seam — at which point it joins
// `ADAPTERS` and the leader action delegates here too.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { UuidRpcResult } from "@/lib/shared/rpc";
import { adminRpc } from "@/lib/admin/rpc";
import { decodeRubricCriteria, type Rubric } from "@/lib/admin/health-rubric";
import { resolveGroupRubricGrade } from "@/lib/admin/group-rubric-grade";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
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

// Only the Group adapter is wired in this slice. The Leader adapter is added in
// its own slice — the second real consumer that proves the seam. Partial so the
// module type-checks with a single adapter present; the unwired branch below
// returns a graceful error result (unreachable until a "leader" caller exists).
const ADAPTERS: { [K in RubricGradeKind]?: RubricGradeAdapter<K> } = {
  group: groupAdapter,
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
