import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  GroupManagementShell,
  type GroupManagementData,
} from "@/components/admin/group-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroups,
  fetchAllMembers,
  fetchProfilesForAdmin,
  fetchRecentAuditEvents,
  type ReadResult,
} from "@/lib/supabase/read-models";
import type { AuditEventsRow } from "@/types/database";

export const dynamic = "force-dynamic";

const EMPTY_DATA = (showAuditTrail: boolean): GroupManagementData => ({
  groups: [],
  profiles: [],
  members: [],
  auditEvents: [],
  showAuditTrail,
  errors: {
    groups: "Supabase is not configured in this environment.",
    profiles: null,
    members: null,
    auditEvents: null,
  },
});

async function loadData(showAuditTrail: boolean): Promise<GroupManagementData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA(showAuditTrail);

  const [groupsResult, profilesResult, membersResult, auditResult] = await Promise.all([
    fetchAllGroups(client),
    fetchProfilesForAdmin(client, { statuses: ["active", "inactive"] }),
    fetchAllMembers(client, { statuses: ["active", "inactive"] }),
    showAuditTrail
      ? fetchRecentAuditEvents(client, {
          limit: 25,
          actionsLike: ["admin.%", "leader.%"],
        })
      : Promise.resolve<ReadResult<AuditEventsRow[]>>({ data: [], error: null }),
  ]);

  return {
    groups: groupsResult.data ?? [],
    profiles: profilesResult.data ?? [],
    members: membersResult.data ?? [],
    auditEvents: auditResult.data ?? [],
    showAuditTrail,
    errors: {
      groups: groupsResult.error?.message ?? null,
      profiles: profilesResult.error?.message ?? null,
      members: membersResult.error?.message ?? null,
      auditEvents: auditResult.error?.message ?? null,
    },
  };
}

export default async function AdminGroupsPage() {
  const session = await requireAdmin();
  const showAuditTrail = session.profile.role === "super_admin";
  const data = await loadData(showAuditTrail);

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Phase 5A.2 · Manage groups"
      title="Every Life Group,"
      titleItalic="held in view."
      lede="Create new groups, polish the details, and quietly close ones that have run their course. Nothing is ever deleted — closed groups stay in the record and can be reopened later."
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
      <GroupManagementShell data={data} />
    </PastoralAppShell>
  );
}
