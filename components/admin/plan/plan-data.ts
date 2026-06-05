import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildProspectBoard,
  fetchPlanGroupOptions,
  fetchProspects,
  type ProspectBoard,
} from "@/lib/supabase/prospect-reads";
import { dueFollowUps, type DueFollowUp } from "@/lib/admin/prospect-next-step";
import { churchTodayIso } from "@/lib/shared/church-time";

// The Plan / Interest Funnel surface's data. Reads all Prospects + all groups
// in one batch, then composes the active board + collapsed Joined roll-up
// purely (buildProspectBoard). `activeGroups` feeds the Match/Join group picker;
// `groupNamesById` resolves the roll-up's group labels.

export type PlanGroupOption = { id: string; name: string };

export type PlanData = {
  board: ProspectBoard;
  activeGroups: PlanGroupOption[];
  // group id → name, for resolving the group label on Matched cards.
  groupNamesById: Record<string, string>;
  // #379: armed follow-ups that have come due (soonest-due first), surfaced as
  // a "due tasks" list above the board.
  dueTasks: DueFollowUp[];
  errors: { prospects: string | null; groups: string | null };
};

export const EMPTY_PLAN_DATA: PlanData = {
  board: { columns: [], joined: [] },
  activeGroups: [],
  groupNamesById: {},
  dueTasks: [],
  errors: {
    prospects: "The database is not configured in this environment.",
    groups: "The database is not configured in this environment.",
  },
};

export async function loadPlanData(): Promise<PlanData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_PLAN_DATA;

  const [prospectsResult, groupsResult] = await Promise.all([
    fetchProspects(client),
    fetchPlanGroupOptions(client),
  ]);

  const prospects = prospectsResult.data ?? [];
  const groups = groupsResult.data ?? [];

  const groupNamesById: Record<string, string> = {};
  for (const g of groups) groupNamesById[g.id] = g.name;

  const board = buildProspectBoard(prospects, groupNamesById);

  // #379: armed follow-ups that have come due (church-local today). Only
  // non-archived prospects are eligible — a joined/archived prospect's step is
  // no longer an active task. connect_to_group_leader never appears (it is
  // back-office; dueFollowUps encodes that).
  const dueTasks = dueFollowUps(
    prospects.filter((p) => !p.archived),
    churchTodayIso()
  );

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
    errors: {
      prospects: prospectsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
    },
  };
}
