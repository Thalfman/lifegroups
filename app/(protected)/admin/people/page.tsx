import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  PeopleManagementShell,
  type PeopleManagementData,
} from "@/components/admin/people-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchAllMembers,
  fetchActiveMemberships,
  fetchProfilesForAdmin,
  fetchRecentAuditEvents,
  type ReadResult,
} from "@/lib/supabase/read-models";
import type { AuditEventsRow } from "@/types/database";

export const dynamic = "force-dynamic";

const EMPTY_DATA = (
  currentActorProfileId: string,
  showAuditTrail: boolean,
): PeopleManagementData => ({
  currentActorProfileId,
  showAuditTrail,
  profiles: [],
  members: [],
  groups: [],
  groupLeaders: [],
  memberships: [],
  auditEvents: [],
  errors: {
    profiles: null,
    members: null,
    groups: null,
    leaders: null,
    memberships: null,
    auditEvents: showAuditTrail ? "Supabase is not configured in this environment." : null,
  },
});

async function loadData(
  currentActorProfileId: string,
  showAuditTrail: boolean,
): Promise<PeopleManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA(currentActorProfileId, showAuditTrail);

  const [
    profilesResult,
    membersResult,
    groupsResult,
    leadersResult,
    membershipsResult,
    auditResult,
  ] = await Promise.all([
    fetchProfilesForAdmin(client, { statuses: ["active", "inactive"] }),
    fetchAllMembers(client, { statuses: ["active", "inactive"] }),
    fetchAllGroups(client),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchActiveMemberships(client),
    showAuditTrail
      ? fetchRecentAuditEvents(client, {
          limit: 25,
          actionsLike: ["admin.%", "leader.%"],
        })
      : Promise.resolve<ReadResult<AuditEventsRow[]>>({ data: [], error: null }),
  ]);

  return {
    currentActorProfileId,
    showAuditTrail,
    profiles: profilesResult.data ?? [],
    members: membersResult.data ?? [],
    groups: groupsResult.data ?? [],
    groupLeaders: leadersResult.data ?? [],
    memberships: membershipsResult.data ?? [],
    auditEvents: auditResult.data ?? [],
    errors: {
      profiles: profilesResult.error?.message ?? null,
      members: membersResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      leaders: leadersResult.error?.message ?? null,
      memberships: membershipsResult.error?.message ?? null,
      auditEvents: auditResult.error?.message ?? null,
    },
  };
}

export default async function AdminPeoplePage() {
  const session = await requireAdmin();
  const showAuditTrail = session.profile.role === "super_admin";
  const data = await loadData(session.profile.id, showAuditTrail);

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Phase 5A.1 · Manage people"
      title="The whole church,"
      titleItalic="known by name."
      lede={
        showAuditTrail
          ? "Add leaders, record members, place them into groups, and keep the directory true. Every change here is recorded in the audit trail at the bottom of the page."
          : "Add leaders, record members, place them into groups, and keep the directory true."
      }
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <PeopleManagementShell data={data} />
    </PastoralAppShell>
  );
}
