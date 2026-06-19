import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  ShepherdCareInteractionType,
  ShepherdCareStatus,
} from "@/types/enums";
import { columns, wrapError, type ReadResult } from "@/lib/supabase/read-core";
import { isUuid } from "@/lib/shared/uuid";

// Read side for the Member Care list backend (the member half of the Care
// list, gated behind the Super-Admin `care_member_list` flag; UI deferred).
// Parallel to lib/supabase/shepherd-care-reads.ts but for non-login members.
//
// Admin-only data: every read runs behind the admin layout guard AND the
// tables' admin-only RLS (auth_is_admin(); no leader / over_shepherd path).
// Column-allowlisted — never select("*"). The tables are not in the generated
// supabase schema types, so their selects are cast here, the same trust seam
// the leader-/group-health grade reads use.

export type MemberCareProfileRow = {
  id: string;
  member_id: string;
  current_status: ShepherdCareStatus;
  last_contact_at: string | null;
  next_touchpoint_due: string | null;
  admin_summary: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MemberCareInteractionRow = {
  id: string;
  care_profile_id: string;
  interaction_at: string;
  interaction_type: ShepherdCareInteractionType;
  notes: string | null;
  created_by_profile_id: string;
  created_at: string;
};

// Column allowlists pinned to the row types above via `columns<…>()`, so each
// select string and its row type derive from one list.
export const MEMBER_CARE_PROFILE_COLUMNS = columns<MemberCareProfileRow>()(
  "id",
  "member_id",
  "current_status",
  "last_contact_at",
  "next_touchpoint_due",
  "admin_summary",
  "archived_at",
  "created_at",
  "updated_at"
);

export const MEMBER_CARE_INTERACTION_COLUMNS =
  columns<MemberCareInteractionRow>()(
    "id",
    "care_profile_id",
    "interaction_at",
    "interaction_type",
    "notes",
    "created_by_profile_id",
    "created_at"
  );

// One member's care profile, or null when no care has been recorded yet
// (success-with-null, not an error).
export async function fetchMemberCareProfileByMemberId(
  client: AppSupabaseClient,
  memberId: string
): Promise<ReadResult<MemberCareProfileRow | null>> {
  if (!isUuid(memberId)) return { data: null, error: null };
  const { data, error } = await (client as AppSupabaseClient)
    .from("member_care_profiles" as never)
    .select(MEMBER_CARE_PROFILE_COLUMNS.select as never)
    .eq("member_id" as never, memberId as never)
    .maybeSingle<MemberCareProfileRow>();
  if (error)
    return {
      data: null,
      error: wrapError("fetchMemberCareProfileByMemberId", error),
    };
  return { data: data ?? null, error: null };
}

// The append-only interaction history for a member care profile, newest first.
export async function fetchMemberCareInteractionsForAdmin(
  client: AppSupabaseClient,
  careProfileId: string
): Promise<ReadResult<MemberCareInteractionRow[]>> {
  if (!isUuid(careProfileId)) return { data: [], error: null };
  const { data, error } = await (client as AppSupabaseClient)
    .from("member_care_interactions" as never)
    .select(MEMBER_CARE_INTERACTION_COLUMNS.select as never)
    .eq("care_profile_id" as never, careProfileId as never)
    .order("interaction_at" as never, { ascending: false } as never)
    .order("created_at" as never, { ascending: false } as never);
  if (error)
    return {
      data: null,
      error: wrapError("fetchMemberCareInteractionsForAdmin", error),
    };
  return {
    data: (data ?? []) as unknown as MemberCareInteractionRow[],
    error: null,
  };
}

// Every member care profile (admin directory of the member care list). The
// future member-care UI joins these against the members roster; kept here so
// flipping the flag is a UI-surfacing task, not a new read path.
export async function fetchAllMemberCareProfilesForAdmin(
  client: AppSupabaseClient
): Promise<ReadResult<MemberCareProfileRow[]>> {
  const { data, error } = await (client as AppSupabaseClient)
    .from("member_care_profiles" as never)
    .select(MEMBER_CARE_PROFILE_COLUMNS.select as never)
    .is("archived_at" as never, null as never);
  if (error)
    return {
      data: null,
      error: wrapError("fetchAllMemberCareProfilesForAdmin", error),
    };
  return {
    data: (data ?? []) as unknown as MemberCareProfileRow[],
    error: null,
  };
}
