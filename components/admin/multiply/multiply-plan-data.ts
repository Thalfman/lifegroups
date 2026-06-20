import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchApprenticePickerRefs,
  fetchGroupRefs,
  fetchGroupTypes,
  fetchGroupTypeConfigs,
  fetchMultiplicationCandidatesForAdmin,
} from "@/lib/supabase/read-models";
import {
  buildMultiplicationView,
  type MultiplicationView,
} from "@/components/admin/launch-planning/launch-planning-data";
import {
  buildPipelineView,
  UNTYPED_SEGMENT,
  type PipelineTypeView,
} from "@/lib/admin/multiplication";
import type { ShepherdMatchInput } from "@/lib/admin/leader-pipeline";

// The Multiply area's Plan tab (ADR 0022): Julian's per-group multiplication
// plan — the seeded candidate pipeline (ADR 0006), grouped by free-text group
// type. This loader is the thin reads seam (ADR 0015) that gathers ONLY the
// three multiplication reads and shapes them into the planner's props via the
// shared `buildMultiplicationView`. It deliberately does NOT call
// loadLaunchPlanningData() — that bundles the whole launch-planning forecast,
// capacity board, and scenarios, none of which the Plan tab renders. The
// candidate write actions still live in the (off-nav) launch-planning route and
// resolve by direct import; they revalidate /admin/multiply so this tab refreshes.

export type MultiplyPlanData = MultiplicationView & {
  error: string | null;
  // ADR 0030 Pipeline (minimal): the group types the admin has pipelined
  // (in_pipeline=true), and the full master list (for the "add to pipeline"
  // control). Both degrade to [] on a failed read without blocking the planner.
  pipelinedTypes: string[];
  groupTypes: string[];
  // ADR 0030 Module 3 (#756): the type-first Pipeline — each pipelined type with
  // its auto-listed potential candidates (active groups of the type with no
  // saved candidate) and its locked-in candidates. Empty when nothing is
  // pipelined or a blocking read failed.
  pipeline: PipelineTypeView[];
};

export type MultiplyPlanReads = {
  fetchMultiplicationCandidates: OmitClient<
    typeof fetchMultiplicationCandidatesForAdmin
  >;
  // Lean projections — the planner only needs to list active groups (with their
  // free-text type, to derive the candidate segment) and build same-group
  // apprentice-picker labels, so we avoid pulling privacy-sensitive columns
  // (group admin_notes, apprentice notes) into this always-on read path.
  fetchGroupRefs: OmitClient<typeof fetchGroupRefs>;
  fetchApprenticeRefs: OmitClient<typeof fetchApprenticePickerRefs>;
  // Pipeline intent (additive, non-blocking): the per-type configs carry the
  // in_pipeline flag; the master list feeds the add-to-pipeline picker.
  fetchGroupTypeConfigs: OmitClient<typeof fetchGroupTypeConfigs>;
  fetchGroupTypes: OmitClient<typeof fetchGroupTypes>;
};

export function supabaseMultiplyPlanReads(
  client: AppSupabaseClient
): MultiplyPlanReads {
  return bindReads(client, {
    fetchMultiplicationCandidates: fetchMultiplicationCandidatesForAdmin,
    fetchGroupRefs,
    fetchApprenticeRefs: fetchApprenticePickerRefs,
    fetchGroupTypeConfigs,
    fetchGroupTypes,
  });
}

// The documented empty shape: what the Plan tab degrades to when a blocking
// read fails or the database is not configured.
export const EMPTY_MULTIPLY_PLAN_VIEW: MultiplicationView = {
  segments: [],
  groupOptions: [],
  apprenticesByGroup: {},
};

// Pure assembly over the reads seam, gathered through the batch combinator. A
// failure in either the candidate or group read blocks the Pipeline (the
// potential / locked-in candidate lists can't be trusted without them). The
// apprentice read only feeds the OPTIONAL matched-shepherds arm now that the
// legacy planner (and its apprentice picker) is retired from this tab, so it
// degrades to empty rather than blocking (ADR 0030: a missing matched shepherd
// never blocks a pipelined type).
export async function buildMultiplyPlanData(
  reads: MultiplyPlanReads
): Promise<MultiplyPlanData> {
  const batch = await readBatch({
    candidates: () => reads.fetchMultiplicationCandidates(),
    groupRefs: () => reads.fetchGroupRefs(),
    apprenticeRefs: () => reads.fetchApprenticeRefs(),
    // Additive Pipeline reads: a failure degrades to an empty pipeline section,
    // never blocks the planner (so they are excluded from `error` precedence).
    configs: () => reads.fetchGroupTypeConfigs(),
    types: () => reads.fetchGroupTypes(),
  });

  // Error precedence as data: only the candidate and group reads block the
  // Pipeline. A failed apprentice read suppresses matched shepherds (empty)
  // without blocking — the candidates and the lock-in flow still render.
  const error = batch.errors.candidates ?? batch.errors.groupRefs ?? null;

  // The pipeline section degrades gracefully (empty) independent of the blocking
  // reads — suppress a derived value rather than report a false state.
  const configPipelinedTypes = (batch.results.configs.data ?? [])
    .filter((c) => c.in_pipeline)
    .map((c) => c.group_type);
  const groupTypes = batch.results.types.data ?? [];

  if (error)
    return {
      ...EMPTY_MULTIPLY_PLAN_VIEW,
      error,
      pipelinedTypes: configPipelinedTypes,
      groupTypes,
      pipeline: [],
    };

  const view = buildMultiplicationView(
    batch.results.candidates.data ?? [],
    batch.results.groupRefs.data ?? [],
    batch.results.apprenticeRefs.data ?? []
  );

  // A type that already has a saved (locked-in) candidate must stay visible even
  // when its `group_type_configs.in_pipeline` flag is still false/default: the
  // flag defaults false and is not backfilled from existing candidates, and the
  // legacy planner that used to surface every saved candidate is now retired from
  // this tab. So union the explicitly-pipelined types with the types of active
  // candidates, deduped case-insensitively (buildPipelineView also dedupes, but
  // we keep the returned list clean). Untyped is excluded — a pipelined type is
  // always concrete.
  const candidateTypes = view.segments
    .filter((s) => s.segment !== UNTYPED_SEGMENT && s.candidates.length > 0)
    .map((s) => s.segment);
  const seenTypeKeys = new Set<string>();
  const pipelinedTypes: string[] = [];
  for (const type of [...configPipelinedTypes, ...candidateTypes]) {
    const key = type.trim().toLowerCase();
    if (!key || seenTypeKeys.has(key)) continue;
    seenTypeKeys.add(key);
    pipelinedTypes.push(type);
  }
  // ADR 0030 (#758): the supply side. Each active apprentice's home-group type is
  // joined from the already-loaded group refs (the picker refs carry id /
  // group_id / display_name / readiness_stage; the group refs carry name +
  // group_type), so matchShepherdsToType can match an apprentice to a pipelined
  // type by their group's type — no extra read needed. A missing group join
  // leaves the apprentice Untyped, which never matches a concrete type.
  const groupById = new Map(
    (batch.results.groupRefs.data ?? []).map((g) => [g.id, g])
  );
  const apprenticeMatchInputs: ShepherdMatchInput[] = (
    batch.results.apprenticeRefs.data ?? []
  ).map((entry) => {
    const group = groupById.get(entry.apprentice.group_id);
    return {
      id: entry.apprentice.id,
      displayName: entry.apprentice.display_name,
      groupName: group?.name ?? "Unknown group",
      groupType: group?.group_type ?? null,
      stage: entry.apprentice.readiness_stage,
    };
  });
  // The potential-candidate pool is the active groups not already anchored to a
  // candidate (groupOptions); the locked-in candidates are the saved candidates
  // flattened out of their segments. buildPipelineView partitions all three —
  // potential candidates, locked-in candidates, and matched shepherds — onto the
  // pipelined types.
  const pipeline = buildPipelineView(
    pipelinedTypes,
    view.groupOptions,
    view.segments.flatMap((s) => s.candidates),
    apprenticeMatchInputs
  );
  return { ...view, error: null, pipelinedTypes, groupTypes, pipeline };
}

export async function loadMultiplyPlanData(): Promise<MultiplyPlanData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      ...EMPTY_MULTIPLY_PLAN_VIEW,
      error: "Database is not configured in this environment.",
      pipelinedTypes: [],
      groupTypes: [],
      pipeline: [],
    };
  }
  return buildMultiplyPlanData(supabaseMultiplyPlanReads(client));
}
