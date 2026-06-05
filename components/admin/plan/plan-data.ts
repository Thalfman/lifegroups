import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildProspectBoard,
  fetchProspects,
  type ProspectBoard,
} from "@/lib/supabase/prospect-reads";
import { fetchAllGroups } from "@/lib/supabase/read-models";

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
  errors: { prospects: string | null; groups: string | null };
};

export const EMPTY_PLAN_DATA: PlanData = {
  board: { columns: [], joined: [] },
  activeGroups: [],
  groupNamesById: {},
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
    fetchAllGroups(client),
  ]);

  const prospects = prospectsResult.data ?? [];
  const groups = groupsResult.data ?? [];

  const groupNamesById: Record<string, string> = {};
  for (const g of groups) groupNamesById[g.id] = g.name;

  const board = buildProspectBoard(prospects, groupNamesById);

  // Open groups (not closed) are the valid Match/Join targets.
  const activeGroups: PlanGroupOption[] = groups
    .filter((g) => g.lifecycle_status !== "closed")
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    board,
    activeGroups,
    groupNamesById,
    errors: {
      prospects: prospectsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
    },
  };
}
