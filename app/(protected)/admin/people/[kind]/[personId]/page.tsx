import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import {
  PersonDetailShell,
  type PersonDetail,
  type PersonGroupRef,
} from "@/components/admin/person-detail/person-detail-shell";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import {
  careCadenceWindowsFromDefaults,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { ROLE_LABELS, isLeaderRole } from "@/lib/auth/roles";
import { P, fontBody } from "@/lib/pastoral";
import type { GroupsRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Params = { kind: string; personId: string };

// Every non-closed group is a valid placement target: the assignment RPC only
// requires the group to exist, and groups that are launching_soon, needs_leader,
// at_risk, or paused are exactly the ones still being staffed. Only `closed`
// (terminal) groups cannot receive placements, matching the old group-centric
// Assignments matrix, which rendered every open group.
function assignableGroupOptions(
  groups: GroupsRow[]
): { id: string; name: string }[] {
  return groups
    .filter((g) => g.lifecycle_status !== "closed")
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Whether a single leader's care cadence has lapsed. Built from the same
// shepherd-care directory + windows the Care area uses, then narrowed to this
// profile, so the person page and the Care queue never disagree.
async function leaderNeedsContact(
  client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  profileId: string,
  todayIso: string
): Promise<boolean> {
  const [assignmentsRes, metricDefaultsRes] = await Promise.all([
    fetchActiveShepherdCoverageAssignmentsForAdmin(client),
    fetchMetricDefaultsCached(client),
  ]);
  const windows = careCadenceWindowsFromDefaults(
    decodeMetricDefaults(metricDefaultsRes.data ?? null)
  );
  const delegatedShepherdIds = assignmentsRes.error
    ? undefined
    : new Set((assignmentsRes.data ?? []).map((a) => a.shepherd_profile_id));
  const directory = await fetchShepherdCareDirectoryForAdmin(client, {
    todayIso,
    windows,
    delegatedShepherdIds,
  });
  if (directory.error || !directory.data) return false;
  return directory.data.some(
    (e) => e.profile.id === profileId && e.needs_attention
  );
}

async function loadProfileDetail(
  client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  profileId: string,
  todayIso: string
): Promise<{
  person: PersonDetail;
  availableGroups: { id: string; name: string }[];
} | null> {
  const [profilesRes, groupLeadersRes, groupsRes] = await Promise.all([
    fetchProfilesForAdmin(client, { statuses: ["active", "inactive"] }),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchAllGroups(client),
  ]);

  const profile = (profilesRes.data ?? []).find((p) => p.id === profileId);
  if (!profile) return null;

  const groups = groupsRes.data ?? [];
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const personGroups: PersonGroupRef[] = (groupLeadersRes.data ?? [])
    .filter((gl) => gl.profile_id === profileId && gl.active)
    .map((gl) => ({
      id: gl.group_id,
      name: groupNameById.get(gl.group_id) ?? "Unknown group",
      roleInGroup: gl.role,
    }));

  const isLeader = isLeaderRole(profile.role);
  const isActive = profile.status === "active";
  const needsContact =
    isLeader && isActive
      ? await leaderNeedsContact(client, profileId, todayIso)
      : false;

  const person: PersonDetail = {
    kind: "profile",
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    status: profile.status,
    roleLabel: ROLE_LABELS[profile.role],
    isLoginBacked: true,
    isLeader,
    needsContact,
    // Only leaders/co-leaders can be assigned to a group as staff; the
    // assign-leader RPC rejects any other role, so non-leader login profiles
    // (ministry/super admins, over-shepherds) must not see a placement form
    // that is guaranteed to fail.
    canPlaceInGroup: isLeader,
    groups: personGroups,
    // The shepherd-care surface 404s inactive profiles, so only an active
    // leader gets a working care link.
    careHref:
      isLeader && isActive ? `/admin/shepherd-care/${profile.id}` : null,
  };

  return { person, availableGroups: assignableGroupOptions(groups) };
}

async function loadMemberDetail(
  client: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  memberId: string
): Promise<{
  person: PersonDetail;
  availableGroups: { id: string; name: string }[];
} | null> {
  const [memberRes, membershipsRes, groupsRes] = await Promise.all([
    fetchMembersByIds(client, [memberId]),
    fetchActiveMemberships(client),
    fetchAllGroups(client),
  ]);

  const member = (memberRes.data ?? [])[0];
  if (!member) return null;

  const groups = groupsRes.data ?? [];
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const personGroups: PersonGroupRef[] = (membershipsRes.data ?? [])
    .filter((m) => m.member_id === memberId)
    .map((m) => ({
      id: m.group_id,
      name: groupNameById.get(m.group_id) ?? "Unknown group",
      roleInGroup: m.role,
    }));

  const person: PersonDetail = {
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
    needsContact: false,
    // Members are placed via the assign-member RPC, which accepts any member.
    canPlaceInGroup: true,
    groups: personGroups,
    careHref: null,
  };

  return { person, availableGroups: assignableGroupOptions(groups) };
}

export default async function AdminPersonDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  await requireAdmin();
  const { kind, personId } = await params;
  if (kind !== "profile" && kind !== "member") notFound();

  const client = await createSupabaseServerClient();
  if (!client) {
    return (
      <>
        <PageHeader eyebrow="People" title="Person" italic="detail" />
        <PageBody>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: "#7d3621",
              background: P.terraSoft,
              border: `1px solid ${P.terra}`,
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            The database is not configured in this environment.
          </p>
        </PageBody>
      </>
    );
  }

  const today = currentUtcDateIso();
  const result =
    kind === "profile"
      ? await loadProfileDetail(client, personId, today)
      : await loadMemberDetail(client, personId);

  if (!result) notFound();

  return (
    <>
      <PageHeader
        eyebrow="People"
        title={result.person.fullName}
        italic={result.person.roleLabel.toLowerCase()}
        lede="One person, end to end — overview, group, care, activity, and access. Access and login details stay secondary."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 18 }}>
          <Link
            href="/admin/people"
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              textDecoration: "none",
            }}
          >
            ← Back to People
          </Link>
          <PersonDetailShell
            person={result.person}
            availableGroups={result.availableGroups}
          />
        </div>
      </PageBody>
    </>
  );
}
