import type { AssignableProfile } from "@/components/admin/forms/role-change-form";
import type { SuperAdminWorkspaceId } from "@/lib/admin/super-admin-console-model";
import type { ChecklistRow } from "@/components/admin/system-status-checklist";
import type { AppConfig } from "@/lib/admin/app-config-decode";
import type {
  PermanentDeletionTargetGroup,
  RecentTombstonesState,
} from "@/lib/supabase/permanent-deletion-reads";
import type {
  CleanSlateImpact,
  CleanSlateLatestSnapshot,
  HistoryResetState,
  AttentionResetState,
} from "@/lib/supabase/maintenance-reads";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
  UsageEventsRow,
} from "@/types/database";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type BoundReads } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  BUILT_IN_APP_CONFIG,
  decodeAppConfig,
} from "@/lib/admin/app-config-decode";
import { fetchRecentAuditEvents } from "@/lib/supabase/follow-up-reads";
import {
  fetchAllGroupLeaders,
  fetchAllGroups,
} from "@/lib/supabase/group-reads";
import {
  fetchAllMembers,
  fetchProfilesForAdmin,
} from "@/lib/supabase/membership-reads";
import { fetchPlatformConfig } from "@/lib/supabase/settings-reads";
import {
  fetchActiveOverShepherds,
  fetchCoverageAssignableLeaders,
  fetchCurrentCoverageAssignments,
  fetchRecentUsageEvents,
} from "@/lib/supabase/super-admin-console-reads";
import {
  fetchCleanSlateImpact,
  fetchAuditEventCount,
  fetchLatestCleanSlateSnapshot,
  fetchHistoryResetState,
  fetchAttentionResetState,
} from "@/lib/supabase/maintenance-reads";
import {
  fetchPermanentDeletionTargetCatalog,
  fetchRecentTombstones,
} from "@/lib/supabase/permanent-deletion-reads";
import {
  fetchPendingAccountDeletionRequests,
  type PendingAccountDeletionRequest,
} from "@/lib/supabase/account-deletion-request-reads";

// Phase SAC.4 (#164) coverage editing read shapes.
export type SuperAdminConsoleCoverageAssignment = {
  id: string;
  shepherd_profile_id: string;
  shepherd_name: string;
  over_shepherd_id: string;
  over_shepherd_name: string;
  assigned_at: string;
};

export type SuperAdminConsoleOverShepherd = {
  id: string;
  full_name: string;
};

export type SuperAdminConsoleCoverageLeader = {
  profile_id: string;
  full_name: string;
};
export type AccountDeletionRequestQueueState =
  | { status: "failed" }
  | { status: "empty" }
  | { status: "loaded"; requests: PendingAccountDeletionRequest[] };

export type SuperAdminConsoleData = {
  assignableProfiles: AssignableProfile[];
  inviteUserGroups: { id: string; name: string }[];
  // Phase SAC.4 (#164): current coverage + the pools the assign form draws from.
  coverageAssignments: SuperAdminConsoleCoverageAssignment[];
  overShepherds: SuperAdminConsoleOverShepherd[];
  coverageLeaders: SuperAdminConsoleCoverageLeader[];
  // Phase SAC.1 (#159): decoded Super-Admin-only platform config, backing the
  // console's config tracer. Decodes to built-in defaults when unreadable.
  appConfig: AppConfig;
  auditEvents: AuditEventsRow[];
  // Phase USAGE.1: recent coarse usage telemetry (logins + area views) for the
  // Diagnostics Usage panel. Empty when tracking is off, the read failed, or
  // there's no client — the panel reads the resolved usage_tracking flag to tell
  // "off" apart from "on but quiet".
  usageEvents: UsageEventsRow[];
  // PRD-SAC6 Danger Zone impact previews. Null when the read failed / no client.
  cleanSlateImpact: CleanSlateImpact | null;
  // PRD-SAC6 (#293/#294): the latest un-restored snapshot for the revert/export
  // controls. Null when none is recoverable / the read failed.
  latestCleanSlateSnapshot: CleanSlateLatestSnapshot | null;
  // PRD-SAC6 follow-up: per-category history-reset state (counts + recoverable
  // snapshot per category). Null when the read failed / no client.
  historyResetState: HistoryResetState | null;
  // health-checks-reset: per-surface attention-reset state (baseline + impact +
  // recoverable snapshot). Null when the read failed / no client.
  attentionResetState: AttentionResetState | null;
  auditEventCount: number | null;
  // ADR 0014 (#312–#316): curated permanent-deletion targets + recent tombstones
  // for the danger-zone Permanent Deletion card.
  permanentDeletionTargets: PermanentDeletionTargetGroup[];
  recentTombstones: RecentTombstonesState;
  // #882: never collapse a failed queue read into a false "nothing pending."
  accountDeletionRequestQueue: AccountDeletionRequestQueueState;
  profilesById: Map<string, ProfilesRow>;
  membersById: Map<string, MembersRow>;
  groupsById: Map<string, GroupsRow>;
  checklist: ChecklistRow[];
  errors: {
    audit: string | null;
    profiles: string | null;
    groups: string | null;
    members: string | null;
    leaders: string | null;
    platformConfig: string | null;
  };
};

// The reads this surface assembles, as one interface (ADR 0015). The production
// adapter binds the live client; a test binds an in-memory adapter satisfying
// the same interface. Two adapters, one seam — the seam (not a live Supabase
// client) becomes the unit-test surface for the console's checklist + degrade
// rules, the most consequential surface in the app.
const SUPER_ADMIN_CONSOLE_FETCHERS = {
  fetchProfilesForAdmin,
  fetchAllGroups,
  fetchAllMembers,
  fetchAllGroupLeaders,
  fetchRecentAuditEvents,
  fetchPlatformConfig,
  fetchActiveOverShepherds,
  fetchCoverageAssignableLeaders,
  fetchCurrentCoverageAssignments,
  fetchCleanSlateImpact,
  fetchAuditEventCount,
  fetchLatestCleanSlateSnapshot,
  fetchHistoryResetState,
  fetchAttentionResetState,
  fetchPermanentDeletionTargetCatalog,
  fetchRecentTombstones,
  fetchPendingAccountDeletionRequests,
  fetchRecentUsageEvents,
};

export type SuperAdminConsoleReads = BoundReads<
  typeof SUPER_ADMIN_CONSOLE_FETCHERS
>;

// Production adapter: binds the live Supabase client to every read the console
// needs.
export function supabaseSuperAdminConsoleReads(
  client: AppSupabaseClient
): SuperAdminConsoleReads {
  return bindReads(client, SUPER_ADMIN_CONSOLE_FETCHERS, "super_admin_console");
}

// Every active profile except super_admin is reassignable through the console's
// role-change form. Self-target and super_admin are both blocked (the bootstrap
// owner isn't demoted from the app surface).
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

// When a read fails we render the failure inline in its row so the operator sees
// the actual error rather than a misleading "No X yet" message. Same idea for
// the supabase-not-configured fallback: every row still shows so the 8-row
// layout is preserved, but the data rows read "unknown" instead of pretending to
// be empty. Pure — the unit-test surface the reads seam exists to enable.
export function buildSuperAdminChecklist(
  input: ChecklistInputs
): ChecklistRow[] {
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
        "You wouldn’t see this page otherwise: the route guard redirects every other role to /unauthorized.",
      tone: "info",
    },
    {
      key: "groups",
      label: "Groups exist",
      description: !hasClient
        ? "Unknown: the database isn’t configured in this environment."
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
      label: "Shepherds exist",
      description: !hasClient
        ? "Unknown: the database isn’t configured in this environment."
        : errors.profiles
          ? `Couldn’t load profiles: ${errors.profiles}`
          : leaderProfiles.length > 0
            ? `${leaderProfiles.length} shepherd / co-shepherd profile${
                leaderProfiles.length === 1 ? "" : "s"
              } on file.`
            : "No shepherd or co-shepherd profiles yet. Add one via Manage People.",
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
        ? "Unknown: the database isn’t configured in this environment."
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
      label: "At least one shepherd has an active group assignment",
      description: !hasClient
        ? "Unknown: the database isn’t configured in this environment."
        : errors.leaders
          ? `Couldn’t load group_leaders: ${errors.leaders}`
          : leadersWithAssignment.size > 0
            ? `${leadersWithAssignment.size} shepherd profile${
                leadersWithAssignment.size === 1 ? "" : "s"
              } currently assigned to a group.`
            : "No active group_leaders assignments yet. Assign a shepherd to a group via Manage People.",
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
        ? "Unknown: the database isn’t configured in this environment."
        : errors.audit
          ? `Audit fetch failed: ${errors.audit}`
          : "audit_events readable; the panel above is the canonical surface.",
      tone: !hasClient || errors.audit ? "warn" : "ok",
    },
  ];
}

// The supabase-not-configured fallback: render the console with built-in config
// defaults and "not configured" messages, preserving the full layout. Pure (no
// client), so the degraded shape is unit-testable too.
export function buildNoClientConsoleData(): SuperAdminConsoleData {
  const notConfigured = "The database is not configured in this environment.";
  return {
    assignableProfiles: [],
    inviteUserGroups: [],
    coverageAssignments: [],
    overShepherds: [],
    coverageLeaders: [],
    appConfig: BUILT_IN_APP_CONFIG,
    auditEvents: [],
    usageEvents: [],
    cleanSlateImpact: null,
    latestCleanSlateSnapshot: null,
    historyResetState: null,
    attentionResetState: null,
    auditEventCount: null,
    permanentDeletionTargets: [],
    recentTombstones: { status: "failed", tombstones: [] },
    accountDeletionRequestQueue: { status: "failed" },
    profilesById: new Map(),
    membersById: new Map(),
    groupsById: new Map(),
    checklist: buildSuperAdminChecklist({
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
      platformConfig: notConfigured,
    },
  };
}

// Pure builder (ADR 0015): orchestrates the console's reads through the injected
// seam and assembles the console data shape, degrading each read to its empty
// fallback so a partial failure never reports a false zero. No I/O of its own —
// the live client is bound into `reads` by the production adapter, an in-memory
// adapter by tests.
export async function buildSuperAdminConsoleData(
  reads: SuperAdminConsoleReads,
  options: { currentActorProfileId: string; workspace?: SuperAdminWorkspaceId }
): Promise<SuperAdminConsoleData> {
  const workspace = options.workspace ?? "readiness";
  const [
    profilesResult,
    groupsResult,
    membersResult,
    leadersResult,
    auditResult,
    platformConfigResult,
  ] = await Promise.all([
    reads.fetchProfilesForAdmin({ statuses: ["active", "inactive"] }),
    reads.fetchAllGroups(),
    reads.fetchAllMembers({ statuses: ["active", "inactive"] }),
    reads.fetchAllGroupLeaders({ activeOnly: true }),
    reads.fetchRecentAuditEvents({
      limit: 25,
      actionsLike: ["admin.%", "leader.%", "super_admin.%"],
    }),
    reads.fetchPlatformConfig(),
  ]);

  let overShepherds: SuperAdminConsoleOverShepherd[] = [];
  let coverageLeaders: SuperAdminConsoleCoverageLeader[] = [];
  let coverageAssignments: SuperAdminConsoleCoverageAssignment[] = [];
  if (workspace === "access") {
    [overShepherds, coverageLeaders, coverageAssignments] = await Promise.all([
      reads.fetchActiveOverShepherds(),
      reads.fetchCoverageAssignableLeaders(),
      reads.fetchCurrentCoverageAssignments(),
    ]);
  }

  let usageEvents: UsageEventsRow[] = [];
  if (workspace === "usage") {
    const usageResult = await reads.fetchRecentUsageEvents({ limit: 200 });
    usageEvents = usageResult.data ?? [];
  }

  let cleanSlateImpact: CleanSlateImpact | null = null;
  let latestCleanSlateSnapshot: CleanSlateLatestSnapshot | null = null;
  let historyResetState: HistoryResetState | null = null;
  let attentionResetState: AttentionResetState | null = null;
  let auditEventCount: number | null = null;
  let permanentDeletionTargets: PermanentDeletionTargetGroup[] = [];
  let recentTombstones: RecentTombstonesState = {
    status: "failed",
    tombstones: [],
  };
  let accountDeletionRequestQueue: AccountDeletionRequestQueueState = {
    status: "failed",
  };
  if (workspace === "danger") {
    const [
      cleanSlateResult,
      auditCountResult,
      latestSnapshotResult,
      historyResetResult,
      attentionResetResult,
      loadedDeletionTargets,
      loadedTombstones,
      pendingAccountDeletionRequestsResult,
    ] = await Promise.all([
      reads.fetchCleanSlateImpact(),
      reads.fetchAuditEventCount(),
      reads.fetchLatestCleanSlateSnapshot(),
      reads.fetchHistoryResetState(),
      reads.fetchAttentionResetState(),
      reads.fetchPermanentDeletionTargetCatalog(),
      reads.fetchRecentTombstones(),
      reads.fetchPendingAccountDeletionRequests(),
    ]);

    cleanSlateImpact = cleanSlateResult.data;
    auditEventCount = auditCountResult.data;
    latestCleanSlateSnapshot = latestSnapshotResult.data;
    historyResetState = historyResetResult.data;
    attentionResetState = attentionResetResult.data;
    permanentDeletionTargets = loadedDeletionTargets;
    recentTombstones = loadedTombstones;
    const pendingRequests = pendingAccountDeletionRequestsResult.data ?? [];
    accountDeletionRequestQueue = pendingAccountDeletionRequestsResult.error
      ? { status: "failed" }
      : pendingRequests.length === 0
        ? { status: "empty" }
        : { status: "loaded", requests: pendingRequests };
  }

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
    platformConfig: platformConfigResult.error?.message ?? null,
  };

  const assignableProfiles = buildAssignableProfiles(
    profiles,
    options.currentActorProfileId
  );

  // Active-only, name-sorted view of groups for the Invite user form.
  // Reuses the already-fetched groups so no extra DB read.
  const inviteUserGroups = groups
    .filter((g) => g.lifecycle_status === "active")
    .map((g) => ({ id: g.id, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const checklist = buildSuperAdminChecklist({
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
    coverageAssignments,
    overShepherds,
    coverageLeaders,
    appConfig: decodeAppConfig(platformConfigResult.data),
    auditEvents: auditEvents as AuditEventsRow[],
    // Usage telemetry is a soft signal: on a read failure show an empty panel
    // rather than alarming with a banner — it's optional, off-by-default data.
    usageEvents,
    cleanSlateImpact,
    latestCleanSlateSnapshot,
    historyResetState,
    attentionResetState,
    auditEventCount,
    permanentDeletionTargets,
    recentTombstones,
    accountDeletionRequestQueue,
    profilesById,
    membersById,
    groupsById,
    checklist,
    errors,
  };
}

// I/O wrapper: build the live client and branch to the no-client fallback when
// it's absent, else assemble through the production reads adapter. The page is a
// thin async Server Component that calls this and hands the shape to the shell.
export async function loadSuperAdminConsoleData(
  currentActorProfileId: string,
  workspace: SuperAdminWorkspaceId = "readiness"
): Promise<SuperAdminConsoleData> {
  const client = await createSupabaseServerClient();
  if (!client) return buildNoClientConsoleData();
  return buildSuperAdminConsoleData(supabaseSuperAdminConsoleReads(client), {
    currentActorProfileId,
    workspace,
  });
}
