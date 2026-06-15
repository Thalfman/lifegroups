import type { AssignableProfile } from "@/components/admin/forms/role-change-form";
import type { ChecklistRow } from "@/components/admin/system-status-checklist";
import type { AppConfig } from "@/lib/admin/app-config-decode";
import type {
  PermanentDeletionTargetGroup,
  RecentTombstone,
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
  recentTombstones: RecentTombstone[];
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
