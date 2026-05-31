import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import {
  SuperAdminConsoleShell,
  type SuperAdminConsoleData,
  type SuperAdminTestAccountsSummary,
} from "@/components/admin/super-admin-console-shell";
import { TestAccountsPanel } from "@/components/admin/test-accounts-panel";
import type { AssignableProfile } from "@/components/admin/forms/role-change-form";
import type { ChecklistRow } from "@/components/admin/system-status-checklist";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { testAccountsStatus } from "./test-accounts-actions";
import {
  fetchAllGroupLeaders,
  fetchAllGroups,
  fetchAllMembers,
  fetchPlatformConfig,
  fetchProfilesForAdmin,
  fetchRecentAuditEvents,
} from "@/lib/supabase/read-models";
import {
  BUILT_IN_APP_CONFIG,
  decodeAppConfig,
} from "@/lib/admin/app-config-decode";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

export const dynamic = "force-dynamic";

// Every active profile except super_admin is reassignable through this form.
// Self-target and super_admin are both blocked (the bootstrap owner isn't
// demoted from the app surface). Legacy staff_viewer accounts remain
// reassignable so operators can migrate them to an active role.
function isAssignableTargetRole(
  role: ProfilesRow["role"]
): role is Exclude<ProfilesRow["role"], "super_admin"> {
  return role !== "super_admin";
}

function buildAssignableProfiles(
  profiles: ProfilesRow[],
  currentActorProfileId: string
): AssignableProfile[] {
  return profiles
    .filter(
      (p) =>
        p.status === "active" &&
        p.id !== currentActorProfileId &&
        isAssignableTargetRole(p.role)
    )
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      current_role: p.role as AssignableProfile["current_role"],
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

type ChecklistInputs = {
  hasClient: boolean;
  profiles: ProfilesRow[];
  groups: GroupsRow[];
  members: MembersRow[];
  activeGroupLeaders: { profile_id: string }[];
  errors: {
    profiles: string | null;
    groups: string | null;
    members: string | null;
    leaders: string | null;
    audit: string | null;
  };
};

// When a read fails we render the failure inline in its row so the
// operator sees the actual error rather than a misleading "No X yet"
// message. Same idea for the supabase-not-configured fallback: every
// row still shows so the 8-row layout is preserved, but the data rows
// read "unknown" instead of pretending to be empty.
function buildChecklist(input: ChecklistInputs): ChecklistRow[] {
  const { hasClient, profiles, groups, members, activeGroupLeaders, errors } =
    input;
  const leaderProfiles = profiles.filter(
    (p) => p.role === "leader" || p.role === "co_leader"
  );
  const leadersWithAssignment = new Set(
    activeGroupLeaders.map((l) => l.profile_id)
  );

  return [
    {
      key: "supabase",
      label: "Database configured",
      description: hasClient
        ? "Server client built; reads and writes can reach the database."
        : "Database environment variables are not set.",
      tone: hasClient ? "ok" : "warn",
    },
    {
      key: "is_super_admin",
      label: "Current user is super_admin",
      description:
        "You wouldn’t see this page otherwise — the route guard redirects every other role to /unauthorized.",
      tone: "info",
    },
    {
      key: "groups",
      label: "Groups exist",
      description: !hasClient
        ? "Unknown — the database isn’t configured in this environment."
        : errors.groups
          ? `Couldn’t load groups: ${errors.groups}`
          : groups.length > 0
            ? `${groups.length} group${groups.length === 1 ? "" : "s"} on file (active and closed).`
            : "No groups yet. Add one via Manage Groups.",
      tone:
        !hasClient || errors.groups
          ? "warn"
          : groups.length > 0
            ? "ok"
            : "warn",
    },
    {
      key: "leaders",
      label: "Leaders exist",
      description: !hasClient
        ? "Unknown — the database isn’t configured in this environment."
        : errors.profiles
          ? `Couldn’t load profiles: ${errors.profiles}`
          : leaderProfiles.length > 0
            ? `${leaderProfiles.length} leader / co-leader profile${
                leaderProfiles.length === 1 ? "" : "s"
              } on file.`
            : "No leader or co-leader profiles yet. Add one via Manage People.",
      tone:
        !hasClient || errors.profiles
          ? "warn"
          : leaderProfiles.length > 0
            ? "ok"
            : "warn",
    },
    {
      key: "members",
      label: "Members exist",
      description: !hasClient
        ? "Unknown — the database isn’t configured in this environment."
        : errors.members
          ? `Couldn’t load members: ${errors.members}`
          : members.length > 0
            ? `${members.length} member record${members.length === 1 ? "" : "s"} on file.`
            : "No members yet. Members are non-auth participant records added via Manage People.",
      tone:
        !hasClient || errors.members
          ? "warn"
          : members.length > 0
            ? "ok"
            : "warn",
    },
    {
      key: "leader_assignment",
      label: "At least one leader has an active group assignment",
      description: !hasClient
        ? "Unknown — the database isn’t configured in this environment."
        : errors.leaders
          ? `Couldn’t load group_leaders: ${errors.leaders}`
          : leadersWithAssignment.size > 0
            ? `${leadersWithAssignment.size} leader profile${
                leadersWithAssignment.size === 1 ? "" : "s"
              } currently assigned to a group.`
            : "No active group_leaders assignments yet. Assign a leader to a group via Manage People.",
      tone:
        !hasClient || errors.leaders
          ? "warn"
          : leadersWithAssignment.size > 0
            ? "ok"
            : "warn",
    },
    {
      key: "audit_access",
      label: "Audit log access available",
      description: !hasClient
        ? "Unknown — the database isn’t configured in this environment."
        : errors.audit
          ? `Audit fetch failed: ${errors.audit}`
          : "audit_events readable; the panel above is the canonical surface.",
      tone: !hasClient || errors.audit ? "warn" : "ok",
    },
  ];
}

function buildNoClientData(): SuperAdminConsoleData {
  const notConfigured = "The database is not configured in this environment.";
  return {
    assignableProfiles: [],
    inviteUserGroups: [],
    appConfig: BUILT_IN_APP_CONFIG,
    auditEvents: [],
    profilesById: new Map(),
    membersById: new Map(),
    groupsById: new Map(),
    checklist: buildChecklist({
      hasClient: false,
      profiles: [],
      groups: [],
      members: [],
      activeGroupLeaders: [],
      errors: {
        profiles: notConfigured,
        groups: notConfigured,
        members: notConfigured,
        leaders: notConfigured,
        audit: notConfigured,
      },
    }),
    errors: {
      audit: notConfigured,
      profiles: notConfigured,
      groups: notConfigured,
      members: notConfigured,
      leaders: notConfigured,
    },
  };
}

async function loadData(
  currentActorProfileId: string
): Promise<SuperAdminConsoleData> {
  const client = await createSupabaseServerClient();
  if (!client) return buildNoClientData();

  const [
    profilesResult,
    groupsResult,
    membersResult,
    leadersResult,
    auditResult,
    platformConfigResult,
  ] = await Promise.all([
    fetchProfilesForAdmin(client, { statuses: ["active", "inactive"] }),
    fetchAllGroups(client),
    fetchAllMembers(client, { statuses: ["active", "inactive"] }),
    fetchAllGroupLeaders(client, { activeOnly: true }),
    fetchRecentAuditEvents(client, {
      limit: 25,
      actionsLike: ["admin.%", "leader.%", "super_admin.%"],
    }),
    fetchPlatformConfig(client),
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

  const errors = {
    profiles: profilesResult.error?.message ?? null,
    groups: groupsResult.error?.message ?? null,
    members: membersResult.error?.message ?? null,
    leaders: leadersResult.error?.message ?? null,
    audit: auditResult.error?.message ?? null,
  };

  const assignableProfiles = buildAssignableProfiles(
    profiles,
    currentActorProfileId
  );

  // Active-only, name-sorted view of groups for the Invite user form.
  // Reuses the already-fetched groupsResult so no extra DB read.
  const inviteUserGroups = groups
    .filter((g) => g.lifecycle_status === "active")
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const checklist = buildChecklist({
    hasClient: true,
    profiles,
    groups,
    members,
    activeGroupLeaders,
    errors,
  });

  return {
    assignableProfiles,
    inviteUserGroups,
    appConfig: decodeAppConfig(platformConfigResult.data),
    auditEvents: auditEvents as AuditEventsRow[],
    profilesById,
    membersById,
    groupsById,
    checklist,
    errors,
  };
}

function buildTestAccountsSummary(
  result: Awaited<ReturnType<typeof testAccountsStatus>>
): SuperAdminTestAccountsSummary {
  if (!result.ok) {
    return {
      label: "Unknown",
      tone: "warning",
      description:
        result.errors[0] ??
        "Test account status could not be loaded from the existing Edge Function.",
    };
  }

  if (!result.value.ok) {
    return {
      label: "Blocked",
      tone: "blocked",
      description:
        result.value.errors[0] ??
        "The test account Edge Function returned a blocked status.",
    };
  }

  if (result.value.enabledOverall) {
    return {
      label: "Active",
      tone: "warning",
      description:
        "Known-password test accounts are active. Keep them visible for testing and disable them before launch.",
    };
  }

  return {
    label: "Disabled",
    tone: "good",
    description:
      "Known test accounts are not currently enabled according to the existing Edge Function status.",
  };
}

export default async function AdminSuperAdminPage() {
  const session = await requireSuperAdmin();
  const data = await loadData(session.profile.id);
  const initialTestAccounts = await testAccountsStatus();
  const testAccountsSummary = buildTestAccountsSummary(initialTestAccounts);

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Command"
        italic="center"
        lede="Owner and operator control plane for launch readiness, access, diagnostics, test tools, audit, maintenance, and guarded danger actions."
      />
      <PageBody>
        <SuperAdminConsoleShell
          data={data}
          testAccountsSummary={testAccountsSummary}
          testAccountsPanel={
            <TestAccountsPanel
              initialStatus={
                initialTestAccounts.ok ? initialTestAccounts.value : null
              }
              initialErrors={
                initialTestAccounts.ok ? [] : initialTestAccounts.errors
              }
            />
          }
        />
      </PageBody>
    </>
  );
}
