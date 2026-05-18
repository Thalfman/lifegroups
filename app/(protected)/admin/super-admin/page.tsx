import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  SuperAdminConsoleShell,
  type SuperAdminConsoleData,
} from "@/components/admin/super-admin-console-shell";
import type { AssignableProfile } from "@/components/admin/forms/role-change-form";
import type { ChecklistRow } from "@/components/admin/system-status-checklist";
import { requireSuperAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchAllMembers,
  fetchProfilesForAdmin,
  fetchRecentAuditEvents,
} from "@/lib/supabase/read-models";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

export const dynamic = "force-dynamic";

const NO_CLIENT_DATA: SuperAdminConsoleData = {
  assignableProfiles: [],
  auditEvents: [],
  profilesById: new Map(),
  membersById: new Map(),
  groupsById: new Map(),
  checklist: [],
  errors: {
    audit: "Supabase is not configured in this environment.",
    profiles: "Supabase is not configured in this environment.",
  },
};

function isAssignableRole(
  role: ProfilesRow["role"],
): role is "ministry_admin" | "leader" | "co_leader" {
  return role === "ministry_admin" || role === "leader" || role === "co_leader";
}

function buildAssignableProfiles(
  profiles: ProfilesRow[],
  currentActorProfileId: string,
): AssignableProfile[] {
  return profiles
    .filter(
      (p) =>
        p.status === "active" &&
        p.id !== currentActorProfileId &&
        isAssignableRole(p.role),
    )
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      current_role: p.role as AssignableProfile["current_role"],
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

function buildChecklist(args: {
  hasClient: boolean;
  profiles: ProfilesRow[];
  groups: GroupsRow[];
  members: MembersRow[];
  activeGroupLeaders: { profile_id: string }[];
  auditError: string | null;
}): ChecklistRow[] {
  const { hasClient, profiles, groups, members, activeGroupLeaders, auditError } = args;
  const leaderProfiles = profiles.filter(
    (p) => p.role === "leader" || p.role === "co_leader",
  );
  const leadersWithAssignment = new Set(activeGroupLeaders.map((l) => l.profile_id));

  return [
    {
      key: "supabase",
      label: "Supabase configured",
      description: hasClient
        ? "Server client built; reads and writes can reach the database."
        : "No NEXT_PUBLIC_SUPABASE_URL / publishable key in this environment.",
      tone: hasClient ? "ok" : "warn",
    },
    {
      key: "is_super_admin",
      label: "Current user is super_admin",
      description:
        "You wouldn&rsquo;t see this page otherwise &mdash; the route guard redirects every other role to /unauthorized.",
      tone: "info",
    },
    {
      key: "groups",
      label: "Groups exist",
      description:
        groups.length > 0
          ? `${groups.length} group${groups.length === 1 ? "" : "s"} on file (active and closed).`
          : "No groups yet. Add one via Manage Groups.",
      tone: groups.length > 0 ? "ok" : "warn",
    },
    {
      key: "leaders",
      label: "Leaders exist",
      description:
        leaderProfiles.length > 0
          ? `${leaderProfiles.length} leader / co-leader profile${
              leaderProfiles.length === 1 ? "" : "s"
            } on file.`
          : "No leader or co-leader profiles yet. Add one via Manage People.",
      tone: leaderProfiles.length > 0 ? "ok" : "warn",
    },
    {
      key: "members",
      label: "Members exist",
      description:
        members.length > 0
          ? `${members.length} member record${members.length === 1 ? "" : "s"} on file.`
          : "No members yet. Members are non-auth participant records added via Manage People.",
      tone: members.length > 0 ? "ok" : "warn",
    },
    {
      key: "leader_assignment",
      label: "At least one leader has an active group assignment",
      description:
        leadersWithAssignment.size > 0
          ? `${leadersWithAssignment.size} leader profile${
              leadersWithAssignment.size === 1 ? "" : "s"
            } currently assigned to a group.`
          : "No active group_leaders assignments yet. Assign a leader to a group via Manage People.",
      tone: leadersWithAssignment.size > 0 ? "ok" : "warn",
    },
    {
      key: "audit_access",
      label: "Audit log access available",
      description: auditError
        ? `Audit fetch failed: ${auditError}`
        : "audit_events readable; the panel above is the canonical surface.",
      tone: auditError ? "warn" : "ok",
    },
    {
      key: "staff_view_deprecated",
      label: "Staff View deprecated",
      description:
        "The /staff route was removed in Phase 5B.0. staff_viewer remains in the enum for compat only.",
      tone: "info",
    },
  ];
}

async function loadData(currentActorProfileId: string): Promise<SuperAdminConsoleData> {
  const client = await createSupabaseServerClient();
  if (!client) return NO_CLIENT_DATA;

  const [profilesResult, groupsResult, membersResult, leadersResult, auditResult] =
    await Promise.all([
      fetchProfilesForAdmin(client, { statuses: ["active", "inactive"] }),
      fetchAllGroups(client),
      fetchAllMembers(client, { statuses: ["active", "inactive"] }),
      fetchAllGroupLeaders(client, { activeOnly: true }),
      fetchRecentAuditEvents(client, {
        limit: 25,
        actionsLike: ["admin.%", "leader.%", "super_admin.%"],
      }),
    ]);

  const profiles = profilesResult.data ?? [];
  const groups = groupsResult.data ?? [];
  const members = membersResult.data ?? [];
  const activeGroupLeaders = (leadersResult.data ?? []).map((l) => ({
    profile_id: l.profile_id,
  }));
  const auditEvents = auditResult.data ?? [];

  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const membersById = new Map(members.map((m) => [m.id, m]));
  const groupsById = new Map(groups.map((g) => [g.id, g]));

  const assignableProfiles = buildAssignableProfiles(profiles, currentActorProfileId);

  const checklist = buildChecklist({
    hasClient: true,
    profiles,
    groups,
    members,
    activeGroupLeaders,
    auditError: auditResult.error?.message ?? null,
  });

  return {
    assignableProfiles,
    auditEvents: auditEvents as AuditEventsRow[],
    profilesById,
    membersById,
    groupsById,
    checklist,
    errors: {
      audit: auditResult.error?.message ?? null,
      profiles: profilesResult.error?.message ?? null,
    },
  };
}

export default async function AdminSuperAdminPage() {
  const session = await requireSuperAdmin();
  const data = await loadData(session.profile.id);

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow="Phase 5A.3 · Super admin"
      title="Owner controls,"
      titleItalic="held quietly."
      lede="The audit log and the one workflow that can change someone&rsquo;s role. Use it sparingly."
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
      <SuperAdminConsoleShell data={data} />
    </PastoralAppShell>
  );
}
