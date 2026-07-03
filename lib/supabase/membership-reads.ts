// NOTE: deliberately NOT marked "server-only" — pure helpers/types in this
// module are still value-imported by client-bundled dashboard demo/fixture
// code; splitting those out is tracked by the #816 module-split work.
import type {
  GroupMembershipsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
import type { MembershipStatus, ProfileStatus, UserRole } from "@/types/enums";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// Column allowlist for the active-membership fetcher (#495); every
// GroupMembershipsRow column, pinned by a colocated test.
export const GROUP_MEMBERSHIP_COLUMNS = columns<GroupMembershipsRow>()(
  "id",
  "group_id",
  "member_id",
  "role",
  "status",
  "joined_at",
  "ended_at",
  "created_at"
);

export async function fetchActiveMemberships(
  client: ReadClient,
  options: { groupId?: string } = {}
): Promise<ReadResult<GroupMembershipsRow[]>> {
  let query = client
    .from("group_memberships")
    .select(GROUP_MEMBERSHIP_COLUMNS.select)
    .eq("status", "active");
  if (options.groupId) query = query.eq("group_id", options.groupId);
  const { data, error } = await query.returns<GroupMembershipsRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchActiveMemberships", error) };
  return { data: data ?? [], error: null };
}

// Column allowlist for the full-row members fetchers (#495). Names every
// MembersRow column so the directory surfaces keep their data, while a future
// members column (members carry pastoral signals like care_sensitivity_flag)
// no longer flows to every caller by default. Pinned by a colocated test.
export const MEMBER_COLUMNS = columns<MembersRow>()(
  "id",
  "full_name",
  "email",
  "phone",
  "household_name",
  "status",
  "care_sensitivity_flag",
  "created_at",
  "updated_at"
);

// Supabase REST responses default-cap rows at ~1000 (see GUEST_PAGE_LIMIT).
// `fetchAllMembers` backs the People directory, the inline assign controls,
// and — via the group-detail People tab — the authoritative group roster, so
// widen past the cap with an explicit range. Without it a member whose name
// sorts past the first page would silently vanish from those lists once a
// deployment crosses ~1000 members (a false-empty, not an error). Beyond ~10k
// members this should move to keyset pagination.
const MEMBER_PAGE_LIMIT = 10000;

export async function fetchMembersByIds(
  client: ReadClient,
  ids: string[]
): Promise<ReadResult<MembersRow[]>> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await client
    .from("members")
    .select(MEMBER_COLUMNS.select)
    .in("id", ids)
    .returns<MembersRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchMembersByIds", error) };
  return { data: data ?? [], error: null };
}

export async function fetchAllMembers(
  client: ReadClient,
  options: { statuses?: MembershipStatus[] } = {}
): Promise<ReadResult<MembersRow[]>> {
  let query = client
    .from("members")
    .select(MEMBER_COLUMNS.select)
    .order("full_name", { ascending: true })
    .range(0, MEMBER_PAGE_LIMIT - 1);
  if (options.statuses && options.statuses.length > 0)
    query = query.in("status", options.statuses);
  const { data, error } = await query.returns<MembersRow[]>();
  if (error) return { data: null, error: wrapError("fetchAllMembers", error) };
  return { data: data ?? [], error: null };
}

// Column allowlist for the admin profiles directory read (#495). Names every
// ProfilesRow column — the directory renders contact + role/status and the
// row type is the trust boundary — so a future profiles column cannot
// silently widen this high-fan-out read. The per-request session profile
// read has its own narrower allowlist in lib/auth/session.ts (#492).
export const PROFILE_COLUMNS = columns<ProfilesRow>()(
  "id",
  "auth_user_id",
  "full_name",
  "email",
  "phone",
  "role",
  "status",
  "created_at",
  "updated_at"
);

export async function fetchProfilesForAdmin(
  client: ReadClient,
  options: { roles?: UserRole[]; statuses?: ProfileStatus[] } = {}
): Promise<ReadResult<ProfilesRow[]>> {
  let query = client
    .from("profiles")
    .select(PROFILE_COLUMNS.select)
    .order("full_name", { ascending: true });
  if (options.roles && options.roles.length > 0)
    query = query.in("role", options.roles);
  if (options.statuses && options.statuses.length > 0)
    query = query.in("status", options.statuses);
  const { data, error } = await query.returns<ProfilesRow[]>();
  if (error)
    return { data: null, error: wrapError("fetchProfilesForAdmin", error) };
  return { data: data ?? [], error: null };
}
