import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { fetchGroupRefs } from "@/lib/supabase/group-reads";
import {
  fetchApprenticePickerRefs,
  fetchMultiplicationCandidatesForAdmin,
} from "@/lib/supabase/multiplication-reads";
import {
  fetchGroupTypes,
  fetchGroupTypeConfigs,
} from "@/lib/supabase/settings-reads";
import {
  buildMultiplicationView,
  type MultiplicationView,
} from "@/components/admin/launch-planning/launch-planning-data";
import {
  buildPipelineView,
  type CandidateView,
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
  // Saved (locked-in) candidates whose type is NOT explicitly pipelined —
  // including Untyped. The type-first Pipeline only renders pipelined types, and
  // the legacy planner that used to surface every saved candidate is retired, so
  // these are shown in a dedicated fallback section to keep them visible without
  // treating "has a candidate" as deliberate pipeline intent.
  unpipelinedCandidates: CandidateView[];
};

const MULTIPLY_PLAN_FETCHERS = {
  fetchMultiplicationCandidates: fetchMultiplicationCandidatesForAdmin,
  // Lean projections — the planner only needs to list active groups (with their
  // free-text type, to derive the candidate segment) and build same-group
  // apprentice-picker labels, so we avoid pulling privacy-sensitive columns
  // (group admin_notes, apprentice notes) into this always-on read path.
  fetchGroupRefs,
  fetchApprenticeRefs: fetchApprenticePickerRefs,
  // Pipeline intent (additive, non-blocking): the per-type configs carry the
  // in_pipeline flag; the master list feeds the add-to-pipeline picker.
  fetchGroupTypeConfigs,
  fetchGroupTypes,
};

export type MultiplyPlanReads = BoundReads<typeof MULTIPLY_PLAN_FETCHERS>;

export function supabaseMultiplyPlanReads(
  client: AppSupabaseClient
): MultiplyPlanReads {
  return bindReads(client, MULTIPLY_PLAN_FETCHERS, "multiply_plan");
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
  // reads — suppress a derived value rather than report a false state. A
  // pipelined type is an EXPLICIT intent (the in_pipeline flag), never inferred
  // from a candidate's presence — so the Add picker, Remove, and potential
  // auto-listing all track deliberate intent only.
  const pipelinedTypes = (batch.results.configs.data ?? [])
    .filter((c) => c.in_pipeline)
    .map((c) => c.group_type);
  const groupTypes = batch.results.types.data ?? [];

  if (error)
    return {
      ...EMPTY_MULTIPLY_PLAN_VIEW,
      error,
      pipelinedTypes,
      groupTypes,
      pipeline: [],
      unpipelinedCandidates: [],
    };

  const view = buildMultiplicationView(
    batch.results.candidates.data ?? [],
    batch.results.groupRefs.data ?? [],
    batch.results.apprenticeRefs.data ?? []
  );
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
  const lockedInCandidates = view.segments.flatMap((s) => s.candidates);
  const pipeline = buildPipelineView(
    pipelinedTypes,
    view.groupOptions,
    lockedInCandidates,
    apprenticeMatchInputs
  );
  // The fallback list: saved candidates whose type isn't explicitly pipelined
  // (including Untyped) have no type section above, so surface them separately so
  // no locked-in plan disappears now that the planner is gone. Matching the same
  // case-insensitive type key buildPipelineView uses; Untyped candidates never
  // match a pipelined (always concrete) type, so they always land here.
  //
  // But if the in_pipeline intent read itself failed, pipelinedTypes is degraded
  // to [] and we can't reliably tell which candidates are "not pipelined" —
  // classifying them all as unpipelined would be a false per-candidate claim. So
  // suppress the fallback too (the pipeline section is already degraded to empty),
  // consistent with the read-degrades-gracefully invariant: suppress derived
  // output rather than report a false state.
  const pipelinedKeys = new Set(
    pipelinedTypes.map((t) => t.trim().toLowerCase())
  );
  const unpipelinedCandidates =
    batch.errors.configs != null
      ? []
      : lockedInCandidates.filter(
          (c) => !pipelinedKeys.has((c.segment ?? "").trim().toLowerCase())
        );
  return {
    ...view,
    error: null,
    pipelinedTypes,
    groupTypes,
    pipeline,
    unpipelinedCandidates,
  };
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
      unpipelinedCandidates: [],
    };
  }
  return buildMultiplyPlanData(supabaseMultiplyPlanReads(client));
}
