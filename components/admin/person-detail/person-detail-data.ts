import { createSupabaseServerClient } from "@/lib/supabase/server";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  currentUtcDateIso,
  fetchActiveMemberships,
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchMembersByIds,
  fetchProfilesForAdmin,
  fetchShepherdCareDirectoryForAdmin,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import { fetchAttentionResetBaselines } from "@/lib/supabase/maintenance-reads";
import {
  profileNeedsContact,
  resolveCareNeedsContact,
} from "@/lib/admin/care-needs-contact";
import { ROLE_LABELS, isLeaderRole, type UserRole } from "@/lib/auth/roles";
import type {
  PersonDetail,
  PersonGroupRef,
} from "@/components/admin/person-detail/person-detail-shell";
import type { GroupsRow } from "@/types/database";

// The person detail page's read-orchestration, as a pure function of a reads
// seam (ADR 0015). The load splits into a fast SPINE (the identity the header
// titles itself with + the 404 decision) and a deferred BODY (the person's
// groups, placement options, and — for an active leader — the care-cadence
// `needsContact` flag, which pulls the whole shepherd-care directory). The page
// awaits the spine, then streams the body inside a Suspense boundary
// (repo-sweep #605), so the header + back link paint before the heavy reads.
// Production binds the live client through `supabasePersonDetailReads`; a test
// binds an in-memory adapter satisfying the same interface. Two adapters, one
// seam.

export type PersonKind = "profile" | "member";

// The identity a person page resolves first: enough to title the header and
// decide 404, before the heavier body reads stream in.
export type PersonSpine = {
  kind: PersonKind;
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  roleLabel: string;
  isLoginBacked: boolean;
  isLeader: boolean;
  // The raw leader role (leader / co_leader) when this person is a shepherd,
  // else null — drives the detail-header "Change role" action (#781 OPP-6),
  // which only applies to those two roles.
  leaderRole: "leader" | "co_leader" | null;
  // The raw login role for a profile (null for non-login members) — gates the
  // detail-header Archive action so a ministry_admin isn't offered Archive for a
  // super_admin target the deactivate RPC rejects as forbidden_target (#788).
  role: UserRole | null;
};

// The page-facing spine result: the identity (for the header + 404 decision)
// plus the no-database case the load wrapper reports when Supabase env vars are
// absent. Resolved synchronously so the route can 404 / show the db-unavailable
// notice before it streams anything.
export type PersonSpineResult =
  | { kind: "ok"; spine: PersonSpine }
  | { kind: "not_found" }
  | { kind: "db_unavailable" };

// The streamed body: the full PersonDetail the client shell renders (spine
// fields + the deferred reads) plus the assignable-group options.
export type PersonBody = {
  person: PersonDetail;
  availableGroups: { id: string; name: string }[];
};

export type PersonDetailReads = {
  fetchProfilesForAdmin: OmitClient<typeof fetchProfilesForAdmin>;
  fetchMembersByIds: OmitClient<typeof fetchMembersByIds>;
  fetchAllGroupLeaders: OmitClient<typeof fetchAllGroupLeaders>;
  fetchAllGroups: OmitClient<typeof fetchAllGroups>;
  fetchActiveMemberships: OmitClient<typeof fetchActiveMemberships>;
  fetchActiveShepherdCoverageAssignments: OmitClient<
    typeof fetchActiveShepherdCoverageAssignmentsForAdmin
  >;
  fetchMetricDefaults: OmitClient<typeof fetchMetricDefaultsCached>;
  fetchAttentionBaselines: OmitClient<typeof fetchAttentionResetBaselines>;
  fetchShepherdCareDirectory: OmitClient<
    typeof fetchShepherdCareDirectoryForAdmin
  >;
};

// Production adapter: binds the live Supabase client to every read this surface
// needs. The underlying fetchers keep their column selections.
export function supabasePersonDetailReads(
  client: AppSupabaseClient
): PersonDetailReads {
  return bindReads(client, {
    fetchProfilesForAdmin,
    fetchMembersByIds,
    fetchAllGroupLeaders,
    fetchAllGroups,
    fetchActiveMemberships,
    fetchActiveShepherdCoverageAssignments:
      fetchActiveShepherdCoverageAssignmentsForAdmin,
    fetchMetricDefaults: fetchMetricDefaultsCached,
    fetchAttentionBaselines: fetchAttentionResetBaselines,
    fetchShepherdCareDirectory: fetchShepherdCareDirectoryForAdmin,
  });
}

// Every non-closed group is a valid placement target: the assignment RPC only
// requires the group to exist, and groups that are launching_soon, needs_leader,
// at_risk, or paused are exactly the ones still being staffed. Only `closed`
// (terminal) groups cannot receive placements.
function assignableGroupOptions(
  groups: GroupsRow[]
): { id: string; name: string }[] {
  return groups
    .filter((g) => g.lifecycle_status !== "closed")
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Whether a single leader's care cadence has lapsed. Built through the shared
// Care needs-contact resolver (lib/admin/care-needs-contact.ts) — the same
// windows + active-coverage + "care" attention-reset baselines + directory
// waterfall the Care tab uses — then narrowed to this profile, so the person
// page and the Care queue answer "needs contact" identically. Passing the "care"
// baselines (which this surface used to omit) is the issue #636 fix: a Leader
// cleared by a care reset no longer reads as needing contact here. Fails closed
// to false (no false "needs contact") when a feeding read fails.
async function leaderNeedsContact(
  reads: PersonDetailReads,
  profileId: string,
  todayIso: string
): Promise<boolean> {
  const resolution = await resolveCareNeedsContact(
    {
      fetchActiveAssignments: reads.fetchActiveShepherdCoverageAssignments,
      fetchMetricDefaults: reads.fetchMetricDefaults,
      fetchAttentionBaselines: reads.fetchAttentionBaselines,
      fetchCareDirectory: reads.fetchShepherdCareDirectory,
    },
    { todayIso }
  );
  return profileNeedsContact(resolution, profileId);
}

// Resolve only the spine: the identity that titles the header and decides 404.
// One read (the profiles list narrowed by id, or a targeted member read). Pure
// in the reads seam so a test can drive it with an in-memory adapter.
export async function resolvePersonSpine(
  reads: PersonDetailReads,
  kind: PersonKind,
  personId: string
): Promise<PersonSpine | null> {
  if (kind === "profile") {
    const profilesRes = await reads.fetchProfilesForAdmin({
      statuses: ["active", "inactive"],
    });
    const profile = (profilesRes.data ?? []).find((p) => p.id === personId);
    if (!profile) return null;
    return {
      kind: "profile",
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      status: profile.status,
      roleLabel: ROLE_LABELS[profile.role],
      isLoginBacked: true,
      isLeader: isLeaderRole(profile.role),
      leaderRole:
        profile.role === "leader" || profile.role === "co_leader"
          ? profile.role
          : null,
      role: profile.role,
    };
  }

  const memberRes = await reads.fetchMembersByIds([personId]);
  const member = (memberRes.data ?? [])[0];
  if (!member) return null;
  return {
    kind: "member",
    id: member.id,
    fullName: member.full_name,
    email: member.email,
    phone: member.phone,
    status: member.status,
    // Members are non-login participant records — never a login role, never an
    // Access tab, never a per-leader care model (issue #302 boundaries).
    roleLabel: "Member",
    isLoginBacked: false,
    isLeader: false,
    // Members are non-login participant records — never a shepherd role.
    leaderRole: null,
    role: null,
  };
}

// Build the full PersonDetail (spine + deferred reads) for the resolved spine.
// The heavy reads — group placements and the active-leader care-cadence flag —
// live here so the page can stream them after the header has painted.
export async function buildPersonBody(
  reads: PersonDetailReads,
  spine: PersonSpine,
  todayIso: string
): Promise<PersonBody> {
  if (spine.kind === "profile") {
    const [groupLeadersRes, groupsRes] = await Promise.all([
      reads.fetchAllGroupLeaders({ activeOnly: true }),
      reads.fetchAllGroups(),
    ]);
    const groups = groupsRes.data ?? [];
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
    const personGroups: PersonGroupRef[] = (groupLeadersRes.data ?? [])
      .filter((gl) => gl.profile_id === spine.id && gl.active)
      .map((gl) => ({
        id: gl.group_id,
        name: groupNameById.get(gl.group_id) ?? "Unknown group",
        roleInGroup: gl.role,
      }));

    const isActive = spine.status === "active";
    const needsContact =
      spine.isLeader && isActive
        ? await leaderNeedsContact(reads, spine.id, todayIso)
        : false;

    const person: PersonDetail = {
      kind: "profile",
      id: spine.id,
      fullName: spine.fullName,
      email: spine.email,
      phone: spine.phone,
      status: spine.status,
      roleLabel: spine.roleLabel,
      isLoginBacked: true,
      isLeader: spine.isLeader,
      needsContact,
      // Only leaders/co-leaders can be assigned to a group as staff; the
      // assign-leader RPC rejects any other role, so non-leader login profiles
      // (ministry/super admins, over-shepherds) must not see a placement form
      // that is guaranteed to fail.
      canPlaceInGroup: spine.isLeader,
      groups: personGroups,
      // The shepherd-care surface 404s inactive profiles, so only an active
      // leader gets a working care link.
      careHref:
        spine.isLeader && isActive ? `/admin/shepherd-care/${spine.id}` : null,
    };

    return { person, availableGroups: assignableGroupOptions(groups) };
  }

  const [membershipsRes, groupsRes] = await Promise.all([
    reads.fetchActiveMemberships(),
    reads.fetchAllGroups(),
  ]);
  const groups = groupsRes.data ?? [];
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const personGroups: PersonGroupRef[] = (membershipsRes.data ?? [])
    .filter((m) => m.member_id === spine.id)
    .map((m) => ({
      id: m.group_id,
      name: groupNameById.get(m.group_id) ?? "Unknown group",
      roleInGroup: m.role,
    }));

  const person: PersonDetail = {
    kind: "member",
    id: spine.id,
    fullName: spine.fullName,
    email: spine.email,
    phone: spine.phone,
    status: spine.status,
    roleLabel: "Member",
    isLoginBacked: false,
    isLeader: false,
    needsContact: false,
    // Members are placed via the assign-member RPC, which accepts any member.
    canPlaceInGroup: true,
    groups: personGroups,
    careHref: null,
  };

  return { person, availableGroups: assignableGroupOptions(groups) };
}

// Binds the live client and resolves only the spine. The page awaits this
// before rendering, so notFound() / db-unavailable behavior is unchanged; the
// heavy body reads stream in afterwards via loadPersonBody.
export async function loadPersonSpine(
  kind: PersonKind,
  personId: string
): Promise<PersonSpineResult> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "db_unavailable" };
  const spine = await resolvePersonSpine(
    supabasePersonDetailReads(client),
    kind,
    personId
  );
  if (!spine) return { kind: "not_found" };
  return { kind: "ok", spine };
}

// Binds the live client and runs the deferred body reads against the
// already-resolved spine. Called inside the route's Suspense boundary so the
// heaviest reads stream in after the header has painted.
export async function loadPersonBody(spine: PersonSpine): Promise<PersonBody> {
  return measureReadBundle(
    "person_detail",
    async () => {
      const client = await createSupabaseServerClient();
      // The spine already proved the client binds for this request; if it
      // somehow does not, surface it to the route error boundary rather than
      // silently degrading.
      if (!client)
        throw new Error("person_detail: Supabase client unavailable");
      return buildPersonBody(
        supabasePersonDetailReads(client),
        spine,
        currentUtcDateIso()
      );
    },
    (body) => ({ result_kind: "ok", person_kind: body.person.kind })
  );
}
