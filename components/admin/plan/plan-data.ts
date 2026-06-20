import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import { readBatch } from "@/lib/supabase/read-batch";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  buildProspectBoard,
  fetchDueFollowUps,
  fetchPlanGroupOptions,
  fetchProspects,
  type ProspectBoard,
} from "@/lib/supabase/prospect-reads";
import { fetchGroupTypesCached } from "@/lib/supabase/cached-config";
import { type DueFollowUp } from "@/lib/admin/prospect-next-step";
import { churchTodayIso } from "@/lib/shared/church-time";

// The Plan / Interest Funnel surface's data. Reads all Prospects + all groups
// in one batch, then composes the active board + collapsed Joined roll-up
// purely (buildProspectBoard). `activeGroups` feeds the Match/Join group picker;
// `groupNamesById` resolves the roll-up's group labels.
//
// Assembly is a pure function of the reads seam (ADR 0015): `loadPlanData`
// binds the live client; tests bind an in-memory adapter satisfying `PlanReads`.

export type PlanGroupOption = { id: string; name: string };

export type PlanData = {
  board: ProspectBoard;
  activeGroups: PlanGroupOption[];
  // group id → name, for resolving the group label on Matched cards.
  groupNamesById: Record<string, string>;
  // #379: armed follow-ups that have come due (soonest-due first), surfaced as
  // a "due tasks" list above the board.
  dueTasks: DueFollowUp[];
  // #746: the admin-managed group_types list, for the create form's desired-type
  // dropdown. Degrades to [] on a failed read — the picker just offers no options,
  // it never blocks the board.
  groupTypes: string[];
  errors: {
    prospects: string | null;
    groups: string | null;
  };
};

export const EMPTY_PLAN_DATA: PlanData = {
  board: { columns: [], joined: [] },
  activeGroups: [],
  groupNamesById: {},
  dueTasks: [],
  groupTypes: [],
  errors: {
    prospects: "The database is not configured in this environment.",
    groups: "The database is not configured in this environment.",
  },
};

// The reads this surface assembles, as one interface (ADR 0015). `loadPlanData`
// binds the live client; a test binds an in-memory adapter.
export type PlanReads = {
  fetchProspects: OmitClient<typeof fetchProspects>;
  fetchPlanGroupOptions: OmitClient<typeof fetchPlanGroupOptions>;
  fetchDueFollowUps: OmitClient<typeof fetchDueFollowUps>;
  fetchGroupTypes: OmitClient<typeof fetchGroupTypesCached>;
};

// Production adapter: binds the live Supabase client to every read this surface
// needs.
export function supabasePlanReads(client: AppSupabaseClient): PlanReads {
  return bindReads(client, {
    fetchProspects,
    fetchPlanGroupOptions,
    fetchDueFollowUps,
    fetchGroupTypes: fetchGroupTypesCached,
  });
}

// Pure assembly: gather the four reads through the batch combinator, then
// compose the board + pickers with a per-section error. Every degrade path is
// reachable from a test through an in-memory `reads` adapter.
export async function buildPlanData(
  reads: PlanReads,
  options: { todayIso: string }
): Promise<PlanData> {
  // #379: due follow-ups are read DIRECTLY (filtered in the DB), not derived from
  // the board page — an older prospect's due step could otherwise fall off the
  // capped, newest-first board and the reminder be silently missed. Only
  // non-archived dated follow_up steps are eligible; connect_to_group_leader and
  // undated steps never appear (encoded in dueFollowUps).
  const batch = await readBatch({
    prospects: () => reads.fetchProspects(),
    groups: () => reads.fetchPlanGroupOptions(),
    dueTasks: () => reads.fetchDueFollowUps(options.todayIso),
    groupTypes: () => reads.fetchGroupTypes(),
  });

  const prospects = batch.results.prospects.data ?? [];
  const groups = batch.results.groups.data ?? [];
  // #746: a failed types read degrades to no options (never blocks the board).
  const groupTypes = batch.results.groupTypes.data ?? [];

  const groupNamesById: Record<string, string> = {};
  for (const g of groups) groupNamesById[g.id] = g.name;

  const board = buildProspectBoard(prospects, groupNamesById);

  const dueTasks = batch.results.dueTasks.data ?? [];

  // Open groups (not closed) are the valid Match/Join targets.
  const activeGroups: PlanGroupOption[] = groups
    .filter((g) => g.lifecycle_status !== "closed")
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    board,
    activeGroups,
    groupNamesById,
    dueTasks,
    groupTypes,
    // Per-section error precedence as data: the due-tasks read folds into the
    // prospects key (both feed the board column), the rest map one-to-one.
    errors: {
      prospects: batch.errors.prospects ?? batch.errors.dueTasks,
      groups: batch.errors.groups,
    },
  };
}

export async function loadPlanData(): Promise<PlanData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_PLAN_DATA;
  return buildPlanData(supabasePlanReads(client), {
    todayIso: churchTodayIso(),
  });
}
