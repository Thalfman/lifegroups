import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchApprenticePickerRefs,
  fetchGroupRefs,
  fetchMultiplicationCandidatesForAdmin,
} from "@/lib/supabase/read-models";
import {
  buildMultiplicationView,
  type MultiplicationView,
} from "@/components/admin/launch-planning/launch-planning-data";

// The Multiply area's Plan tab (ADR 0022): Julian's per-group multiplication
// plan — the seeded candidate pipeline (ADR 0006), grouped by Audience ×
// category. This loader is the thin reads seam (ADR 0015) that gathers ONLY the
// three multiplication reads and shapes them into the planner's props via the
// shared `buildMultiplicationView`. It deliberately does NOT call
// loadLaunchPlanningData() — that bundles the whole launch-planning forecast,
// capacity board, and scenarios, none of which the Plan tab renders. The
// candidate write actions still live in the (off-nav) launch-planning route and
// resolve by direct import; they revalidate /admin/multiply so this tab refreshes.

export type MultiplyPlanData = MultiplicationView & { error: string | null };

export type MultiplyPlanReads = {
  fetchMultiplicationCandidates: OmitClient<
    typeof fetchMultiplicationCandidatesForAdmin
  >;
  // Lean projections — the planner only needs to list active groups and build
  // same-group apprentice-picker labels, so we avoid pulling privacy-sensitive
  // columns (group admin_notes, apprentice notes) into this always-on read path.
  fetchGroupRefs: OmitClient<typeof fetchGroupRefs>;
  fetchApprenticeRefs: OmitClient<typeof fetchApprenticePickerRefs>;
};

export function supabaseMultiplyPlanReads(
  client: AppSupabaseClient
): MultiplyPlanReads {
  return bindReads(client, {
    fetchMultiplicationCandidates: fetchMultiplicationCandidatesForAdmin,
    fetchGroupRefs,
    fetchApprenticeRefs: fetchApprenticePickerRefs,
  });
}

const EMPTY_VIEW: MultiplicationView = {
  segments: [],
  availableGroups: [],
  apprenticesByGroup: {},
};

// Pure assembly over the reads seam. A failure in any of the three source reads
// blocks the planner (mirrors the launch-planning host): the apprentice picker
// must not render with no options and silently clear leader_pipeline_id on save.
export async function buildMultiplyPlanData(
  reads: MultiplyPlanReads
): Promise<MultiplyPlanData> {
  const [candidatesRes, groupRefsRes, apprenticeRefsRes] = await Promise.all([
    reads.fetchMultiplicationCandidates(),
    reads.fetchGroupRefs(),
    reads.fetchApprenticeRefs(),
  ]);

  const error =
    candidatesRes.error?.message ??
    groupRefsRes.error?.message ??
    apprenticeRefsRes.error?.message ??
    null;

  if (error) return { ...EMPTY_VIEW, error };

  const todayIso = new Date().toISOString().slice(0, 10);
  const view = buildMultiplicationView(
    candidatesRes.data ?? [],
    groupRefsRes.data ?? [],
    apprenticeRefsRes.data ?? [],
    todayIso
  );
  return { ...view, error: null };
}

export async function loadMultiplyPlanData(): Promise<MultiplyPlanData> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      ...EMPTY_VIEW,
      error: "Database is not configured in this environment.",
    };
  }
  return buildMultiplyPlanData(supabaseMultiplyPlanReads(client));
}
