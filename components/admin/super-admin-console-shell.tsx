import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { OwnerControlsOverview } from "@/components/admin/owner-controls-overview";
import { AuditTrailSection } from "@/components/admin/audit-trail-section";
import {
  AuditWorkspace,
  type AuditEntry,
} from "@/components/admin/audit-workspace";
import {
  AUDIT_ACTION_LABELS,
  categorizeAuditAction,
  summarizeAuditEvent,
} from "@/lib/admin/audit-summary";
import {
  SuperAdminConsole,
  type SuperAdminWorkspace,
} from "@/components/admin/super-admin-console";
import {
  DangerZoneConsole,
  type DangerWorkflowGroup,
} from "@/components/admin/danger-zone-console";
import {
  RoleChangeForm,
  type AssignableProfile,
} from "@/components/admin/forms/role-change-form";
import { InviteUserForm } from "@/components/admin/forms/invite-user-form";
import { InviteLinkForm } from "@/components/admin/forms/invite-link-form";
import { PlatformConfigTracerForm } from "@/components/admin/forms/platform-config-tracer-form";
import { FeatureFlagToggleForm } from "@/components/admin/forms/feature-flag-toggle-form";
import { EditableCopyForm } from "@/components/admin/forms/editable-copy-form";
import { ProfileStatusForm } from "@/components/admin/forms/profile-status-form";
import { PasswordResetForm } from "@/components/admin/forms/password-reset-form";
import { CoverageAssignForm } from "@/components/admin/forms/coverage-assign-form";
import { CoverageEndForm } from "@/components/admin/forms/coverage-end-form";
import { PeopleImportForm } from "@/components/admin/forms/people-import-form";
import { ResetAllCard } from "@/components/admin/reset-all-card";
import { LaunchPrepCard } from "@/components/admin/launch-prep-card";
import { CleanSlateCard } from "@/components/admin/clean-slate-card";
import { HistoryResetCard } from "@/components/admin/history-reset-card";
import { AttentionResetCard } from "@/components/admin/attention-reset-card";
import { AuditResetCard } from "@/components/admin/audit-reset-card";
import { PermanentDeleteCard } from "@/components/admin/permanent-delete-card";
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
import {
  SystemStatusChecklist,
  type ChecklistRow,
} from "@/components/admin/system-status-checklist";
import type { AppConfig } from "@/lib/admin/app-config-decode";
import {
  FEATURE_FLAG_DEFINITIONS,
  resolveFlag,
} from "@/lib/admin/feature-flags";
import {
  EDITABLE_COPY_DEFINITIONS,
  resolveCopy,
} from "@/lib/admin/editable-copy";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

type StatusTone =
  | "good"
  | "warning"
  | "blocked"
  | "disabled"
  | "active"
  | "planned";

export type SuperAdminTestAccountsSummary = {
  label: string;
  tone: StatusTone;
  description: string;
};

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

const STATUS_STYLE: Record<
  StatusTone,
  { background: string; border: string; color: string }
> = {
  good: { background: P.sageSoft, border: P.sage, color: P.sageTextStrong },
  warning: {
    background: P.mustardSoft,
    border: P.mustard,
    color: P.mustardTextStrong,
  },
  blocked: {
    background: P.terraSoft,
    border: P.terra,
    color: P.terraTextStrong,
  },
  disabled: { background: P.surface, border: P.line, color: P.ink3 },
  active: { background: P.sageSoft, border: P.sage, color: P.sageTextStrong },
  planned: { background: P.surface, border: P.line, color: P.ink2 },
};

const cardStyle: CSSProperties = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 10,
  padding: "18px 22px",
};

const cardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 14,
};

const twoCardGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const formsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
};

// Fixed locale + UTC so the server-rendered status row matches whatever a later
// re-render would produce (no hydration drift). Mirrors the danger cards.
function formatStatusTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const s = STATUS_STYLE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${s.border}`,
        borderRadius: 999,
        background: s.background,
        color: s.color,
        fontFamily: fontSans,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.1,
        lineHeight: 1,
        padding: "6px 9px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// A compact chip for the always-visible status row: an eyebrow label, a status
// badge, and a one-line detail.
function StatusChip({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone: StatusTone;
  detail: string;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        padding: "12px 14px",
        display: "grid",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 700,
          }}
        >
          {label}
        </span>
        <StatusBadge label={value} tone={tone} />
      </div>
      <span
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink2,
          lineHeight: 1.4,
        }}
      >
        {detail}
      </span>
    </div>
  );
}

function WorkspaceHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <h2
        style={{
          fontFamily: fontDisplay,
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: -0.2,
          color: P.ink,
          margin: 0,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          lineHeight: 1.55,
          margin: 0,
          maxWidth: 680,
        }}
      >
        {description}
      </p>
    </div>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        fontFamily: fontDisplay,
        fontSize: 16,
        fontWeight: 600,
        color: P.ink,
        margin: 0,
      }}
    >
      {children}
    </h3>
  );
}

function Panel({
  children,
  style,
  id,
}: {
  children: ReactNode;
  style?: CSSProperties;
  // Optional anchor id so a deep link (e.g. #people-import) can scroll to this
  // panel once its workspace is active. scrollMarginTop keeps it off the edge.
  id?: string;
}) {
  return (
    <div
      id={id}
      style={{
        ...cardStyle,
        display: "grid",
        gap: 12,
        ...(id ? { scrollMarginTop: 16 } : null),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CommandCard({
  title,
  description,
  status,
  children,
  id,
}: {
  title: string;
  description: string;
  status?: { label: string; tone: StatusTone };
  children?: ReactNode;
  // Optional anchor id so a deep link can scroll to this card once its
  // workspace is active.
  id?: string;
}) {
  return (
    <div
      id={id}
      style={{
        ...cardStyle,
        display: "grid",
        gap: 10,
        alignContent: "start",
        ...(id ? { scrollMarginTop: 16 } : null),
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <h3
          style={{
            fontFamily: fontDisplay,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: -0.2,
            color: P.ink,
            margin: 0,
          }}
        >
          {title}
        </h3>
        {status ? (
          <StatusBadge label={status.label} tone={status.tone} />
        ) : null}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {description}
      </p>
      {children}
    </div>
  );
}

function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontFamily: fontSans,
        fontSize: 12,
        color: P.ink2,
      }}
    >
      <span>{label}</span>
      <strong style={{ color: P.ink }}>{value}</strong>
    </div>
  );
}

function ErrorBanner() {
  return (
    <div
      role="alert"
      style={{
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: fontBody,
        fontSize: 13,
        color: P.terraTextStrong,
      }}
    >
      Some data couldn&rsquo;t load. The workspaces below show what did load;
      retry in a moment or check the database connection.
    </div>
  );
}

type NextAction = { title: string; body: string; tone: StatusTone };

// The single most important thing to do right now, derived from the same
// signals the status row uses. Surfaced at the top of the Readiness dashboard so
// the operator isn't left to scan for what matters.
function computeNextAction(input: {
  errorCount: number;
  checklistWarningCount: number;
  testAccountsSummary: SuperAdminTestAccountsSummary;
}): NextAction {
  const { errorCount, checklistWarningCount, testAccountsSummary } = input;
  if (errorCount > 0) {
    return {
      title: "Resolve load errors",
      body: "Some data couldn’t be read. Check the database connection, then reload this page.",
      tone: "warning",
    };
  }
  if (testAccountsSummary.tone === "blocked") {
    return {
      title: "Check test-account tooling",
      body: "The test-account status check came back blocked. Open Diagnostics → Test tools to look into it.",
      tone: "warning",
    };
  }
  if (testAccountsSummary.label === "Active") {
    return {
      title: "Disable test accounts before launch",
      body: "Known-password test accounts are still enabled. Turn them off in Diagnostics → Test tools before going live.",
      tone: "warning",
    };
  }
  // Any remaining non-good test-account status (e.g. "Unknown" when the status
  // check didn't return a clear answer) must not read as launch-ready, since we
  // can't confirm the known-password accounts are off.
  if (testAccountsSummary.tone !== "good") {
    return {
      title: "Confirm test-account status",
      body: "Couldn’t confirm whether known-password test accounts are disabled. Check Diagnostics → Test tools before launch.",
      tone: "warning",
    };
  }
  if (checklistWarningCount > 0) {
    return {
      title: "Finish readiness setup",
      body: `${checklistWarningCount} readiness check${
        checklistWarningCount === 1 ? "" : "s"
      } need attention. Review them in Diagnostics.`,
      tone: "warning",
    };
  }
  return {
    title: "You’re launch-ready",
    body: "No outstanding readiness items. Day-to-day ministry work happens in /admin and /leader.",
    tone: "good",
  };
}

function NextActionCard({ action }: { action: NextAction }) {
  const s = STATUS_STYLE[action.tone];
  return (
    <div
      style={{
        background: s.background,
        border: `1px solid ${s.border}`,
        borderRadius: 10,
        padding: "16px 20px",
        display: "grid",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: s.color,
            fontWeight: 700,
          }}
        >
          Next step
        </span>
        <StatusBadge
          label={action.tone === "good" ? "Ready" : "Action"}
          tone={action.tone}
        />
      </div>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          fontWeight: 600,
          color: P.ink,
          margin: 0,
        }}
      >
        {action.title}
      </h3>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {action.body}
      </p>
    </div>
  );
}

export function SuperAdminConsoleShell({
  data,
  testAccountsPanel,
  testAccountsSummary,
}: {
  data: SuperAdminConsoleData;
  testAccountsPanel: ReactNode;
  testAccountsSummary: SuperAdminTestAccountsSummary;
}) {
  const errorCount = Object.values(data.errors).filter(Boolean).length;
  const checklistWarningCount = data.checklist.filter(
    (row) => row.tone === "warn"
  ).length;
  const readinessTone: StatusTone =
    errorCount > 0 || checklistWarningCount > 0 ? "warning" : "good";
  const readinessLabel = readinessTone === "good" ? "Good" : "Warning";
  let activeProfiles = 0;
  for (const profile of data.profilesById.values()) {
    if (profile.status === "active") activeProfiles += 1;
  }

  const lastEvent = data.auditEvents[0] ?? null;
  const nextAction = computeNextAction({
    errorCount,
    checklistWarningCount,
    testAccountsSummary,
  });

  const statusRow = (
    <div className="lg-m-grid-stack" style={statusRowGridStyle}>
      <StatusChip
        label="Readiness"
        value={readinessLabel}
        tone={readinessTone}
        detail={`${checklistWarningCount} warning${
          checklistWarningCount === 1 ? "" : "s"
        } · ${errorCount} load error${errorCount === 1 ? "" : "s"}`}
      />
      <StatusChip
        label="Access"
        value="Guarded"
        tone="good"
        detail={`${activeProfiles} active profile${
          activeProfiles === 1 ? "" : "s"
        }`}
      />
      <StatusChip
        label="Test accounts"
        value={testAccountsSummary.label}
        tone={testAccountsSummary.tone}
        detail={
          testAccountsSummary.label === "Active"
            ? "Disable before launch"
            : testAccountsSummary.label === "Disabled"
              ? "Not enabled"
              : testAccountsSummary.label === "Blocked"
                ? "Status check blocked"
                : "Status unavailable"
        }
      />
      <StatusChip
        label="Last audit event"
        value={lastEvent ? "Recorded" : "None"}
        tone={lastEvent ? "active" : "planned"}
        detail={
          lastEvent
            ? `${formatStatusTime(lastEvent.created_at)} UTC${
                data.auditEventCount != null
                  ? ` · ${data.auditEventCount} total`
                  : ""
              }`
            : "No actions recorded yet"
        }
      />
      <StatusChip
        label="Danger actions"
        value="Locked"
        tone="good"
        detail="Type-to-confirm on every action"
      />
    </div>
  );

  const workspaces: SuperAdminWorkspace[] = [
    {
      id: "readiness",
      label: "Readiness",
      node: (
        <ReadinessWorkspace
          data={data}
          errorCount={errorCount}
          checklistWarningCount={checklistWarningCount}
          readinessTone={readinessTone}
          readinessLabel={readinessLabel}
          activeProfiles={activeProfiles}
          testAccountsSummary={testAccountsSummary}
          nextAction={nextAction}
        />
      ),
    },
    {
      id: "access",
      label: "Access",
      node: <AccessWorkspace data={data} />,
    },
    {
      id: "config",
      label: "Config",
      node: <ConfigWorkspace data={data} />,
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      node: (
        <DiagnosticsWorkspace
          data={data}
          testAccountsPanel={testAccountsPanel}
        />
      ),
    },
    {
      id: "audit",
      label: "Audit",
      node: <AuditWorkspacePanel data={data} />,
    },
    {
      id: "danger",
      label: "Danger Zone",
      danger: true,
      node: <DangerWorkspace data={data} />,
    },
  ];

  return (
    <SuperAdminConsole
      statusRow={statusRow}
      // Rendered above every workspace so a failed read stays visible no matter
      // which workspace is open (only the active panel mounts).
      banner={errorCount > 0 ? <ErrorBanner /> : null}
      workspaces={workspaces}
      defaultWorkspaceId="readiness"
      hashAliases={LEGACY_HASH_ALIASES}
    />
  );
}

// The old console used 11 in-page anchors; the six-workspace console folds those
// into workspaces. Map the legacy section ids to the workspace that now holds
// them so existing deep links (e.g. Settings' "Open import" →
// /admin/super-admin#people-import) keep landing on the right panel.
const LEGACY_HASH_ALIASES: Record<string, string> = {
  overview: "readiness",
  "people-import": "access",
  coverage: "access",
  features: "config",
  settings: "config",
  "test-tools": "diagnostics",
  maintenance: "diagnostics",
  "danger-zone": "danger",
};

const statusRowGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

// ---------------------------------------------------------------------------
// Workspace 1 — Readiness (default)
// ---------------------------------------------------------------------------

function ReadinessWorkspace({
  data,
  errorCount,
  checklistWarningCount,
  readinessTone,
  readinessLabel,
  activeProfiles,
  testAccountsSummary,
  nextAction,
}: {
  data: SuperAdminConsoleData;
  errorCount: number;
  checklistWarningCount: number;
  readinessTone: StatusTone;
  readinessLabel: string;
  activeProfiles: number;
  testAccountsSummary: SuperAdminTestAccountsSummary;
  nextAction: NextAction;
}) {
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <WorkspaceHeader
        title="Readiness"
        description="A quick read on whether the platform is ready, and the one thing worth doing next. The rest of the controls live in the workspaces above."
      />
      <NextActionCard action={nextAction} />
      <div className="lg-m-grid-stack" style={cardGridStyle}>
        <CommandCard
          title="Readiness signal"
          description={`${checklistWarningCount} readiness warning${
            checklistWarningCount === 1 ? "" : "s"
          } and ${errorCount} load error${
            errorCount === 1 ? "" : "s"
          } across the current reads.`}
          status={{ label: readinessLabel, tone: readinessTone }}
        />
        <CommandCard
          title="Access"
          description="Role changes stay limited to active, non-self, non-super-admin profiles."
          status={{ label: "Good", tone: "good" }}
        >
          <MetricRow label="Active profiles" value={activeProfiles} />
          <MetricRow
            label="Eligible role targets"
            value={data.assignableProfiles.length}
          />
        </CommandCard>
        <CommandCard
          title="Test accounts"
          description={testAccountsSummary.description}
          status={{
            label: testAccountsSummary.label,
            tone: testAccountsSummary.tone,
          }}
        />
      </div>
      <HelpAboutDetails />
    </div>
  );
}

// The long "what lives here" copy lives behind a plain disclosure so the default
// dashboard stays compact.
function HelpAboutDetails() {
  return (
    <details
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
      }}
    >
      <summary
        className="lg-sac-summary"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          fontFamily: fontSans,
          fontSize: 13,
          fontWeight: 600,
          color: P.ink2,
        }}
      >
        About this console
      </summary>
      <div style={{ padding: "4px 18px 18px" }}>
        <OwnerControlsOverview />
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Workspace 2 — Access
// ---------------------------------------------------------------------------

function AccessWorkspace({ data }: { data: SuperAdminConsoleData }) {
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <WorkspaceHeader
        title="Access"
        description="Roles, invitations, and account status. Guardrails are enforced for you: you can’t change your own role, super admin can’t be assigned from the app, and every action is audited."
      />
      <div className="lg-m-grid-stack" style={formsGridStyle}>
        <Panel>
          <PanelTitle>Change role</PanelTitle>
          <RoleChangeForm profiles={data.assignableProfiles} />
        </Panel>
        <Panel>
          <InviteUserForm groups={data.inviteUserGroups} />
        </Panel>
        <Panel>
          <InviteLinkForm groups={data.inviteUserGroups} />
        </Panel>
      </div>
      <AccountManagementCard data={data} />

      <section style={{ display: "grid", gap: 14 }}>
        <SubsectionHeader
          title="People Ops"
          hint="Bulk-add people and manage over-shepherd coverage."
        />
        <div className="lg-m-grid-stack" style={twoCardGridStyle}>
          <PeopleImportCard />
          <CoverageManagementCard data={data} />
        </div>
      </section>
    </div>
  );
}

function SubsectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 17,
          fontWeight: 600,
          color: P.ink,
          margin: 0,
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {hint}
      </p>
    </div>
  );
}

// Per-profile disable / re-enable + password reset. Lists every loaded profile
// except the bootstrap super_admin (which the RPC also refuses). The actor's own
// profile is guarded server-side. Rendered as a status table with non-wrapping
// action buttons.
function AccountManagementCard({ data }: { data: SuperAdminConsoleData }) {
  const profiles = Array.from(data.profilesById.values())
    .filter((p) => p.role !== "super_admin")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <Panel>
      <PanelTitle>Account status</PanelTitle>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Disable or re-enable a profile, or send a password-reset email. Every
        action is audited. You can&rsquo;t disable yourself or the super admin.
      </p>
      {profiles.length === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12,
            color: P.ink3,
            margin: 0,
          }}
        >
          No profiles loaded.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 1,
            background: P.line2,
            border: `1px solid ${P.line}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {profiles.map((p) => (
            <div
              key={p.id}
              className="lg-m-grid-stack"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                background: P.surface,
                padding: "10px 14px",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 13,
                    fontWeight: 600,
                    color: P.ink,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {p.full_name}
                  <StatusBadge
                    label={p.status === "active" ? "Active" : "Disabled"}
                    tone={p.status === "active" ? "good" : "disabled"}
                  />
                </div>
                <div
                  style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}
                >
                  {p.email}
                </div>
              </div>
              {/* nowrap keeps the two small actions on one line rather than
                  stacking into two-line buttons (Admin Interaction Model). */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  flexWrap: "nowrap",
                }}
              >
                <ProfileStatusForm profileId={p.id} currentStatus={p.status} />
                <PasswordResetForm profileId={p.id} email={p.email} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function PeopleImportCard() {
  return (
    <Panel id="people-import">
      <PanelTitle>People import</PanelTitle>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Paste CSV to create leader profiles and member records in one audited
        batch. Parsing and de-duplication run before any write; skipped rows are
        reported back.
      </p>
      {/* A correctly-shaped empty template the operator can fill in and paste
          straight back (#289). Plain anchor, not a Link, so the browser follows
          the attachment download. */}
      <div>
        <a
          href="/admin/super-admin/people-import-template"
          download
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 999,
            fontFamily: fontSans,
            fontSize: 12,
            fontWeight: 500,
            color: P.ink,
            background: "transparent",
            border: `1px solid ${P.line}`,
            textDecoration: "none",
          }}
        >
          Download CSV template
        </a>
      </div>
      <PeopleImportForm />
    </Panel>
  );
}

// Current coverage list (with end controls) + the assign form.
function CoverageManagementCard({ data }: { data: SuperAdminConsoleData }) {
  return (
    <Panel id="coverage">
      <PanelTitle>Coverage</PanelTitle>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Assign or end Over-Shepherd → Leader coverage. Edits write to the same
        records the cadence tiers and over-shepherd scoping already read.
      </p>
      <CoverageAssignForm
        overShepherds={data.overShepherds}
        leaders={data.coverageLeaders}
      />
      <div style={{ display: "grid", gap: 8 }}>
        {data.coverageAssignments.length === 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
              margin: 0,
            }}
          >
            No active coverage assignments.
          </p>
        ) : (
          data.coverageAssignments.map((a) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                border: `1px solid ${P.line}`,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 13,
                    fontWeight: 600,
                    color: P.ink,
                  }}
                >
                  {a.shepherd_name} → {a.over_shepherd_name}
                </div>
                <div
                  style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}
                >
                  since {a.assigned_at}
                </div>
              </div>
              <CoverageEndForm assignmentId={a.id} />
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Workspace 3 — Config
// ---------------------------------------------------------------------------

function ConfigWorkspace({ data }: { data: SuperAdminConsoleData }) {
  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <WorkspaceHeader
        title="Config"
        description="Feature flags, owner settings, and editable copy. Frozen surfaces stay off until their routes and access are re-verified; clearing a copy value falls back to its built-in default."
      />
      <FeatureFlagsCard data={data} />
      <div className="lg-m-grid-stack" style={twoCardGridStyle}>
        <OwnerSettingsCard data={data} />
        <CommandCard
          title="Ministry settings"
          description="Capacity, check-in timing, and health thresholds stay in the day-to-day admin settings page."
          status={{ label: "Linked", tone: "active" }}
        >
          <Link
            href="/admin/settings"
            style={{
              color: P.terra,
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Open admin settings
          </Link>
        </CommandCard>
      </div>
      <EditableCopyCard data={data} />
    </div>
  );
}

function OwnerSettingsCard({ data }: { data: SuperAdminConsoleData }) {
  return (
    <CommandCard
      id="settings"
      title="Owner settings"
      description="A small saved value you can use to confirm owner settings persist correctly. Saving writes to the owner-only config store with a matching audit entry."
      status={
        data.errors.platformConfig
          ? { label: "Read failed", tone: "blocked" }
          : { label: "Live", tone: "active" }
      }
    >
      {data.errors.platformConfig ? (
        // The form is intentionally withheld on a failed read: the built-in
        // fallback would render the field empty, and saving that would
        // overwrite the real stored value.
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.terraTextStrong,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Couldn’t load owner settings ({data.errors.platformConfig}). Editing
          is disabled until the value reads successfully, so a failed read can’t
          silently overwrite it.
        </p>
      ) : (
        <>
          <div style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}>
            Current value:{" "}
            <strong style={{ color: P.ink }}>
              {data.appConfig.consoleTracerNote
                ? data.appConfig.consoleTracerNote
                : "(empty)"}
            </strong>
          </div>
          <PlatformConfigTracerForm value={data.appConfig.consoleTracerNote} />
        </>
      )}
    </CommandCard>
  );
}

// Real feature-flag list with resolved state + toggles. Each row reads as a
// switch with a name, badges (kind + resolved On/Off), a short risk note, and
// the toggle. Frozen-surface rows are visually distinct so they don't read as
// ordinary toggles.
function FeatureFlagsCard({ data }: { data: SuperAdminConsoleData }) {
  const flags = data.appConfig.featureFlags;
  return (
    <Panel id="features">
      <PanelTitle>Feature flags</PanelTitle>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        New surfaces toggle freely. Frozen surfaces stay off until re-verified,
        so a stale toggle can’t re-expose a surface before its routes and access
        are re-checked.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {FEATURE_FLAG_DEFINITIONS.map((def) => {
          const resolved = resolveFlag(flags, def.key);
          const state = flags[def.key];
          const enabled = state?.enabled === true;
          const frozen = def.kind === "frozen_surface";
          const frozenHeldOff = frozen && enabled && state?.verified !== true;
          const riskNote = frozenHeldOff
            ? "Turned on, but held off until its routes and access are re-verified."
            : frozen
              ? "Frozen surface — stays off until re-verified."
              : null;
          return (
            <div
              key={def.key}
              className="lg-m-grid-stack"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                border: `1px solid ${frozen ? P.mustard : P.line}`,
                borderRadius: 8,
                padding: "10px 12px",
                // Frozen rows carry a distinct accent so they don't read as
                // ordinary toggles.
                ...(frozen
                  ? {
                      background: P.mustardSoft,
                      boxShadow: `inset 3px 0 0 ${P.mustard}`,
                    }
                  : null),
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontFamily: fontSans,
                      fontSize: 13,
                      fontWeight: 600,
                      color: P.ink,
                    }}
                  >
                    {def.label}
                  </span>
                  <StatusBadge
                    label={frozen ? "Frozen" : "New"}
                    tone={frozen ? "warning" : "planned"}
                  />
                  <StatusBadge
                    label={resolved ? "On" : "Off"}
                    tone={resolved ? "good" : "disabled"}
                  />
                </div>
                <p
                  style={{
                    fontFamily: fontBody,
                    fontSize: 12,
                    color: P.ink2,
                    margin: "4px 0 0",
                    lineHeight: 1.45,
                  }}
                >
                  {def.description}
                </p>
                {riskNote ? (
                  <p
                    style={{
                      fontFamily: fontSans,
                      fontSize: 12,
                      color: frozenHeldOff ? P.terraTextStrong : P.ink2,
                      margin: "4px 0 0",
                    }}
                  >
                    {riskNote}
                  </p>
                ) : null}
              </div>
              <FeatureFlagToggleForm flagKey={def.key} enabled={enabled} />
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// Editable-copy list as a compact label + value/save table.
function EditableCopyCard({ data }: { data: SuperAdminConsoleData }) {
  const copy = data.appConfig.editableCopy;
  return (
    <Panel>
      <PanelTitle>Editable copy</PanelTitle>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Configurable strings. Clearing a value falls back to the built-in
        placeholder.
      </p>
      <div
        style={{
          display: "grid",
          gap: 1,
          background: P.line2,
          border: `1px solid ${P.line}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {EDITABLE_COPY_DEFINITIONS.map((def) => (
          <div
            key={def.key}
            className="lg-m-grid-stack"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "center",
              background: P.surface,
              padding: "10px 14px",
            }}
          >
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 13,
                fontWeight: 600,
                color: P.ink,
                minWidth: 0,
              }}
            >
              {def.label}
            </div>
            <EditableCopyForm
              copyKey={def.key}
              currentValue={resolveCopy(copy, def.key)}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Workspace 4 — Diagnostics
// ---------------------------------------------------------------------------

function DiagnosticsWorkspace({
  data,
  testAccountsPanel,
}: {
  data: SuperAdminConsoleData;
  testAccountsPanel: ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
      <WorkspaceHeader
        title="Diagnostics"
        description="Read-only health checks, plus isolated test tooling kept separate from normal app authorization."
      />
      <SystemStatusChecklist rows={data.checklist} />
      <section
        id="test-tools"
        style={{
          border: `1px solid ${P.mustard}`,
          borderRadius: 10,
          background: P.surface,
          boxShadow: `inset 4px 0 0 ${P.mustard}`,
          padding: "16px 20px",
          display: "grid",
          gap: 12,
          scrollMarginTop: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h3
            style={{
              fontFamily: fontDisplay,
              fontSize: 17,
              fontWeight: 600,
              color: P.ink,
              margin: 0,
            }}
          >
            Test tools
          </h3>
          <StatusBadge label="Isolated" tone="warning" />
        </div>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          These tools run against an isolated test-account function, separate
          from normal app authorization. Status reads as enabled, disabled, or
          missing — no secrets are shown.
        </p>
        {testAccountsPanel}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace 5 — Audit
// ---------------------------------------------------------------------------

// Match AuditTrailSection's timestamp format so the filtered list reads
// identically to the default (unfiltered) list it sits beside.
function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function AuditWorkspacePanel({ data }: { data: SuperAdminConsoleData }) {
  const auditSection = (
    <AuditTrailSection
      events={data.auditEvents}
      profilesById={data.profilesById}
      membersById={data.membersById}
      groupsById={data.groupsById}
      error={data.errors.audit}
    />
  );

  // On an audit read failure there are no events to filter and the section
  // surfaces the error itself — render it directly (no filter UI) so a filter
  // interaction can't mask the failure behind a misleading "no matches" state.
  if (data.errors.audit) {
    return <div style={{ minWidth: 0 }}>{auditSection}</div>;
  }

  // The Map-dependent summaries are computed here, server-side, so the client
  // filter receives only flat, serialisable entries (RSC can't ship the Maps).
  const entries: AuditEntry[] = data.auditEvents.map((event) => {
    const actor = event.actor_profile_id
      ? data.profilesById.get(event.actor_profile_id)
      : null;
    return {
      id: event.id,
      summary: summarizeAuditEvent(event, {
        profilesById: data.profilesById,
        membersById: data.membersById,
        groupsById: data.groupsById,
      }),
      actionLabel: AUDIT_ACTION_LABELS[event.action] ?? event.action,
      entityType: event.entity_type,
      actorLabel: actor?.full_name ?? event.actor_name ?? null,
      timestamp: formatAuditTimestamp(event.created_at),
      category: categorizeAuditAction(event.action),
    };
  });

  return (
    <div style={{ minWidth: 0 }}>
      <AuditWorkspace entries={entries} fullList={auditSection} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace 6 — Danger Zone
// ---------------------------------------------------------------------------

function DangerWorkspace({ data }: { data: SuperAdminConsoleData }) {
  const groups: DangerWorkflowGroup[] = [
    {
      id: "launch-reset",
      label: "Launch reset",
      workflows: [
        {
          id: "launch-prep",
          label: "Prepare for launch",
          riskNote:
            "Clear all history and hide the time-based launch warnings.",
          node: (
            <LaunchPrepCard
              impact={data.cleanSlateImpact}
              featureFlags={data.appConfig.featureFlags}
            />
          ),
        },
        {
          id: "reset-all",
          label: "Reset everything",
          riskNote:
            "One clean launch state — history, warnings, and attention.",
          node: (
            <ResetAllCard
              impact={data.cleanSlateImpact}
              featureFlags={data.appConfig.featureFlags}
              attentionState={data.attentionResetState}
            />
          ),
        },
      ],
    },
    {
      id: "history-reset",
      label: "History reset",
      workflows: [
        {
          id: "clean-slate",
          label: "Clean slate",
          riskNote: "Clear all accumulated history at once.",
          node: (
            <CleanSlateCard
              impact={data.cleanSlateImpact}
              snapshot={data.latestCleanSlateSnapshot}
            />
          ),
        },
        {
          id: "history-category",
          label: "Reset by category",
          riskNote: "Clear one kind of history at a time.",
          node: <HistoryResetCard state={data.historyResetState} />,
        },
      ],
    },
    {
      id: "attention-reset",
      label: "Attention reset",
      workflows: [
        {
          id: "attention",
          label: "Reset attention",
          riskNote: "Fresh start for the time-based Home cards.",
          node: <AttentionResetCard state={data.attentionResetState} />,
        },
      ],
    },
    {
      id: "audit-reset",
      label: "Audit reset",
      workflows: [
        {
          id: "audit",
          label: "Reset audit log",
          riskNote: "Archive, then purge the live audit log.",
          node: <AuditResetCard auditEventCount={data.auditEventCount} />,
        },
      ],
    },
    {
      id: "permanent-delete",
      label: "Permanent delete",
      workflows: [
        {
          id: "permanent",
          label: "Permanent deletion",
          riskNote: "Physically remove a single curated record.",
          node: (
            <PermanentDeleteCard
              targets={data.permanentDeletionTargets}
              tombstones={data.recentTombstones}
            />
          ),
        },
      ],
    },
  ];

  return <DangerZoneConsole groups={groups} />;
}
