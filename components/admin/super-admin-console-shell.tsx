import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
import { OwnerControlsOverview } from "@/components/admin/owner-controls-overview";
import { AuditTrailSection } from "@/components/admin/audit-trail-section";
import {
  AuditWorkspace,
  type AuditEntry,
} from "@/components/admin/audit-workspace";
import { buildAuditTrailEntries } from "@/lib/admin/audit-trail-entries";
import {
  SuperAdminConsole,
  type SuperAdminWorkspace,
} from "@/components/admin/super-admin-console";
import { SUPER_ADMIN_STICKY_ANCHOR_OFFSET } from "@/components/admin/super-admin-anchors";
import { WorkspaceSectionNav } from "@/components/admin/workspace-section-nav";
import {
  DangerZoneConsole,
  type DangerWorkflowGroup,
} from "@/components/admin/danger-zone-console";
import {
  RoleChangeForm,
  type AssignableProfile,
} from "@/components/admin/forms/role-change-form";
import { InviteWorkflowForm } from "@/components/admin/forms/invite-workflow-form";
import { PlatformConfigTracerForm } from "@/components/admin/forms/platform-config-tracer-form";
import { FeatureFlagToggleForm } from "@/components/admin/forms/feature-flag-toggle-form";
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
import { buildFeatureFlagRows } from "@/lib/admin/feature-flag-display";
import {
  buildSuperAdminConsoleStatus,
  LEGACY_HASH_ALIASES,
  listAccountStatusProfiles,
  type ConsoleStatusAction,
  type SuperAdminConsoleStatus,
  type SuperAdminNextAction,
  type SuperAdminTestAccountsSummary,
  type SuperAdminWorkspaceId,
} from "@/lib/admin/super-admin-console-model";
import { buildUsagePanelModel } from "@/lib/admin/super-admin-usage-model";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/admin/console-status";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
  UsageEventsRow,
} from "@/types/database";

// The shared risk/status vocabulary (#451) lives in console-status so client
// consoles can import it without pulling this server module graph; re-exported
// here so existing importers keep working.
export { StatusBadge, STATUS_STYLE } from "@/components/admin/console-status";
export type { StatusTone } from "@/components/admin/console-status";

// Moved to the pure console model (with the rest of the status derivation);
// re-exported so existing importers (the super-admin page) keep working.
export type { SuperAdminTestAccountsSummary } from "@/lib/admin/super-admin-console-model";

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

// Card anatomy (design direction §4): surface, line border, no shadow.
const CARD_CLASS = "rounded-lg border border-line bg-surface p-card";

// Card grids stack on mobile, spread from md (replacing .lg-m-grid-stack).
const CARD_GRID_CLASS = "grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-3.5";
const TWO_CARD_GRID_CLASS = "grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-3.5";

// A small "go do it" link rendered inside status cards. Plain anchor on
// purpose: the workspace switcher already listens for hash changes (including
// the legacy aliases like #test-tools), so `#diagnostics` both flips the tab
// and scrolls to the named section — no new navigation machinery (#454).
function StatusActionLink({ action }: { action: ConsoleStatusAction }) {
  return (
    <a
      href={`#${action.hash}`}
      className="justify-self-start whitespace-nowrap font-sans text-sm font-semibold text-clay no-underline"
    >
      {action.label} →
    </a>
  );
}

// A compact chip for the always-visible status row: a sentence-case label, a
// status badge, a one-line detail (the plain-language reason when something is
// blocked), and — when the state needs attention — the next best action (#454).
function StatusChip({
  label,
  value,
  tone,
  detail,
  action,
}: {
  label: string;
  value: string;
  tone: StatusTone;
  detail: string;
  action?: ConsoleStatusAction;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-xs font-semibold text-ink3">
          {label}
        </span>
        <StatusBadge label={value} tone={tone} />
      </div>
      <span className="font-sans text-xs leading-snug text-ink2">{detail}</span>
      {action ? <StatusActionLink action={action} /> : null}
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
    <div className="grid gap-1.5">
      <h2 className="m-0 font-display text-xl font-semibold text-ink">
        {title}
      </h2>
      <p className="m-0 max-w-[680px] font-sans text-sm text-ink2">
        {description}
      </p>
    </div>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 font-display text-lg font-medium text-ink">
      {children}
    </h3>
  );
}

function Panel({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  // Optional anchor id so a deep link (e.g. #people-import) can scroll to this
  // panel once its workspace is active. scrollMarginTop clears the sticky
  // TopBar + tab rail so an anchor jump never hides the section under them.
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(CARD_CLASS, "grid gap-3", className)}
      style={
        id ? { scrollMarginTop: SUPER_ADMIN_STICKY_ANCHOR_OFFSET } : undefined
      }
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
      className={cn(CARD_CLASS, "grid content-start gap-2.5")}
      style={
        id ? { scrollMarginTop: SUPER_ADMIN_STICKY_ANCHOR_OFFSET } : undefined
      }
    >
      <div className="flex items-start justify-between gap-2.5">
        <h3 className="m-0 font-display text-lg font-medium text-ink">
          {title}
        </h3>
        {status ? (
          <StatusBadge label={status.label} tone={status.tone} />
        ) : null}
      </div>
      <p className="m-0 font-sans text-sm text-ink2">{description}</p>
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
    <div className="flex justify-between gap-3 font-sans text-xs text-ink2">
      <span>{label}</span>
      <strong className="text-ink">{value}</strong>
    </div>
  );
}

function ErrorBanner() {
  return (
    <div
      role="alert"
      className="rounded-sm border border-rose/40 bg-roseSoft px-3.5 py-3 font-sans text-sm text-rose"
    >
      Some data couldn&rsquo;t load. The workspaces below show what did load;
      retry in a moment or check the database connection.
    </div>
  );
}

// Soft background + matching border per tone for the Next-step card (status
// vocabulary: sage = well, amber = watch, rose = concern); the label picks up
// the deep foreground of the same hue.
const NEXT_ACTION_CARD_CLASS: Record<StatusTone, string> = {
  good: "border-sage bg-sageSoft",
  guarded: "border-sage bg-surface",
  warning: "border-amber bg-amberSoft",
  blocked: "border-rose/40 bg-roseSoft",
  disabled: "border-line bg-surface",
  active: "border-sage bg-sageSoft",
  planned: "border-line bg-surface",
  destructive: "border-rose bg-roseSoft",
  readonly: "border-line bg-surface",
};

const NEXT_ACTION_LABEL_CLASS: Record<StatusTone, string> = {
  good: "text-sageDeep",
  guarded: "text-sageDeep",
  warning: "text-amberText",
  blocked: "text-rose",
  disabled: "text-ink3",
  active: "text-sageDeep",
  planned: "text-ink2",
  destructive: "text-rose",
  readonly: "text-ink2",
};

function NextActionCard({ action }: { action: SuperAdminNextAction }) {
  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-lg border px-5 py-4",
        NEXT_ACTION_CARD_CLASS[action.tone]
      )}
    >
      <div className="flex items-center justify-between gap-2.5">
        <span
          className={cn(
            "font-sans text-xs font-semibold",
            NEXT_ACTION_LABEL_CLASS[action.tone]
          )}
        >
          Next step
        </span>
        <StatusBadge
          label={action.tone === "good" ? "Ready" : "Action"}
          tone={action.tone}
        />
      </div>
      <h3 className="m-0 font-display text-lg font-medium text-ink">
        {action.title}
      </h3>
      <p className="m-0 font-sans text-sm text-ink2">{action.body}</p>
      {action.action ? <StatusActionLink action={action.action} /> : null}
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
  // Every status-row chip, the readiness signal, and the Next-step card come
  // from the pure console model so the branching is unit-tested there; the
  // shell only renders the result.
  const status = buildSuperAdminConsoleStatus({
    errors: data.errors,
    checklist: data.checklist,
    profiles: data.profilesById.values(),
    latestAuditEventAt: data.auditEvents[0]?.created_at ?? null,
    auditEventCount: data.auditEventCount,
    featureFlags: data.appConfig.featureFlags,
    testAccountsSummary,
  });

  const statusRow = (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      {status.chips.map((chip) => (
        <StatusChip key={chip.label} {...chip} />
      ))}
    </div>
  );

  // SuperAdminWorkspaceId keeps every tab id a hash the console model (and its
  // LEGACY_HASH_ALIASES targets) declares.
  const workspaces: (SuperAdminWorkspace & { id: SuperAdminWorkspaceId })[] = [
    {
      id: "readiness",
      label: "Readiness",
      node: (
        <ReadinessWorkspace
          data={data}
          status={status}
          testAccountsSummary={testAccountsSummary}
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
      banner={status.errorCount > 0 ? <ErrorBanner /> : null}
      workspaces={workspaces}
      defaultWorkspaceId="readiness"
      hashAliases={LEGACY_HASH_ALIASES}
    />
  );
}

// ---------------------------------------------------------------------------
// Workspace 1 — Readiness (default)
// ---------------------------------------------------------------------------

function ReadinessWorkspace({
  data,
  status,
  testAccountsSummary,
}: {
  data: SuperAdminConsoleData;
  status: SuperAdminConsoleStatus;
  testAccountsSummary: SuperAdminTestAccountsSummary;
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <WorkspaceHeader
        title="Readiness"
        description="Whether the platform is ready, and the one thing worth doing next. The rest of the controls live in the workspaces above."
      />
      <NextActionCard action={status.nextAction} />
      <div className={CARD_GRID_CLASS}>
        <CommandCard
          title="Readiness signal"
          description={`${status.checklistWarningCount} readiness warning${
            status.checklistWarningCount === 1 ? "" : "s"
          } and ${status.errorCount} load error${
            status.errorCount === 1 ? "" : "s"
          } across the current reads.`}
          status={{ label: status.readinessLabel, tone: status.readinessTone }}
        />
        <CommandCard
          title="Access"
          description="Role changes stay limited to active, non-self, non-super-admin profiles."
          status={{ label: "Good", tone: "good" }}
        >
          <MetricRow label="Active profiles" value={status.activeProfiles} />
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
    <details className="rounded-lg border border-line bg-surface">
      <summary className="lg-sac-summary flex items-center gap-2 px-[18px] py-3 font-sans text-sm font-semibold text-ink2">
        About this console
      </summary>
      <div className="px-[18px] pb-[18px] pt-1">
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
    <div className="grid min-w-0 gap-4">
      <WorkspaceHeader
        title="Access"
        description="Roles, invitations, and account status. Guardrails are enforced for you: you can’t change your own role, super admin can’t be assigned from the app, and every action is audited."
      />
      <WorkspaceSectionNav
        ariaLabel="Access sections"
        sections={[
          { id: "change-role", label: "Change role" },
          { id: "invite", label: "Invite user" },
          { id: "account-status", label: "Account status" },
          { id: "people-import", label: "People import" },
          { id: "coverage", label: "Coverage" },
        ]}
      />
      {/* Change role gets its own full-width row (#455): squeezed into the
          auto-fit forms grid its 1fr/160px/auto columns collapsed the Profile
          select and left tall dead space when a neighbour ran longer. */}
      <Panel id="change-role">
        <PanelTitle>Change role</PanelTitle>
        <RoleChangeForm profiles={data.assignableProfiles} />
      </Panel>
      {/* One unified invite card (#460): email invite and shareable link are
          a delivery choice inside the same workflow, so role/group are picked
          once instead of across two near-identical panels. */}
      <Panel id="invite">
        <InviteWorkflowForm groups={data.inviteUserGroups} />
      </Panel>
      <AccountManagementCard data={data} />

      <section className="grid gap-3.5">
        <SubsectionHeader
          title="People Ops"
          hint="Bulk-add people and manage over-shepherd coverage."
        />
        <div className={TWO_CARD_GRID_CLASS}>
          <PeopleImportCard />
          <CoverageManagementCard data={data} />
        </div>
      </section>
    </div>
  );
}

function SubsectionHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="grid gap-1">
      <h3 className="m-0 font-display text-lg font-medium text-ink">{title}</h3>
      <p className="m-0 font-sans text-sm text-ink2">{hint}</p>
    </div>
  );
}

// Per-profile disable / re-enable + password reset. Lists every loaded profile
// except the bootstrap super_admin (which the RPC also refuses). The actor's own
// profile is guarded server-side. Rendered as a status table with non-wrapping
// action buttons.
function AccountManagementCard({ data }: { data: SuperAdminConsoleData }) {
  const profiles = listAccountStatusProfiles(data.profilesById);

  return (
    <Panel id="account-status">
      <PanelTitle>Account status</PanelTitle>
      <p className="m-0 font-sans text-sm text-ink2">
        Disable or re-enable a profile, or send a password-reset email. Every
        action is audited. You can&rsquo;t disable yourself or the super admin.
      </p>
      {profiles.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">No profiles loaded.</p>
      ) : (
        <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-lineSoft">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="flex min-h-11 flex-wrap items-center justify-between gap-3 bg-surface px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-sans text-sm font-semibold text-ink">
                  {p.full_name}
                  <StatusBadge
                    label={p.status === "active" ? "Active" : "Disabled"}
                    tone={p.status === "active" ? "good" : "disabled"}
                  />
                </div>
                <div className="font-sans text-xs text-ink2">{p.email}</div>
              </div>
              {/* nowrap keeps the two small actions on one line rather than
                  stacking into two-line buttons (Admin Interaction Model). */}
              <div className="flex flex-nowrap items-start gap-2.5">
                <ProfileStatusForm
                  profileId={p.id}
                  profileName={p.full_name}
                  currentStatus={p.status}
                />
                <PasswordResetForm
                  profileId={p.id}
                  profileName={p.full_name}
                  email={p.email}
                />
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
      <p className="m-0 font-sans text-sm text-ink2">
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
          className={buttonClassName("ghost", "sm")}
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
      <p className="m-0 font-sans text-sm text-ink2">
        Assign or end Over-Shepherd → Leader coverage. Edits write to the same
        records the cadence tiers and over-shepherd scoping already read.
      </p>
      <CoverageAssignForm
        overShepherds={data.overShepherds}
        leaders={data.coverageLeaders}
      />
      <div className="grid gap-2">
        {data.coverageAssignments.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink3">
            No active coverage assignments.
          </p>
        ) : (
          data.coverageAssignments.map((a) => (
            <div
              key={a.id}
              className="flex min-h-11 items-center justify-between gap-3 rounded-sm border border-line px-3 py-2.5"
            >
              <div>
                <div className="font-sans text-sm font-semibold text-ink">
                  {a.shepherd_name} → {a.over_shepherd_name}
                </div>
                <div className="font-sans text-xs text-ink2">
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
    <div className="grid min-w-0 gap-4">
      <WorkspaceHeader
        title="Config"
        description="Feature flags, owner settings, and editable copy. Flags marked Held stay off until they pass a safety review; clearing a copy value falls back to its built-in default."
      />
      <WorkspaceSectionNav
        ariaLabel="Config sections"
        sections={[
          { id: "features", label: "Feature flags" },
          { id: "settings", label: "Owner settings" },
          { id: "ministry-settings", label: "Ministry settings" },
        ]}
      />
      <FeatureFlagsCard data={data} />
      <div className={TWO_CARD_GRID_CLASS}>
        <OwnerSettingsCard data={data} />
        <CommandCard
          id="ministry-settings"
          title="Ministry settings"
          description="Capacity, check-in timing, and health thresholds stay in the day-to-day admin settings page."
          status={{ label: "Linked", tone: "active" }}
        >
          <Link
            href="/admin/settings"
            className="font-sans text-sm font-semibold text-clay no-underline"
          >
            Open admin settings
          </Link>
        </CommandCard>
      </div>
    </div>
  );
}

function OwnerSettingsCard({ data }: { data: SuperAdminConsoleData }) {
  return (
    <CommandCard
      id="settings"
      title="Owner settings"
      description="A small saved value you can use to confirm owner settings persist correctly. Saving writes to the owner-only settings with a matching audit entry."
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
        <p className="m-0 font-sans text-sm text-rose">
          Couldn’t load owner settings ({data.errors.platformConfig}). Editing
          is disabled until the value reads successfully, so a failed read can’t
          silently overwrite it.
        </p>
      ) : (
        <>
          <div className="font-sans text-xs text-ink2">
            Current value:{" "}
            <strong className="text-ink">
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
// the toggle. The badge/risk-note wording is derived in the pure
// feature-flag-display model; this card only renders the rows.
function FeatureFlagsCard({ data }: { data: SuperAdminConsoleData }) {
  const rows = buildFeatureFlagRows(data.appConfig.featureFlags);
  return (
    <Panel id="features">
      <PanelTitle>Feature flags</PanelTitle>
      <p className="m-0 font-sans text-sm text-ink2">
        Most flags take effect as soon as you flip them. Flags marked{" "}
        <strong>Held</strong> only record your intent: the surface stays off
        until it passes a safety review, so nothing is re-exposed by accident.
        Flags marked <strong>Nav</strong> show or hide a tab in the admin
        navigation — hiding a tab does not block access to its pages.
      </p>
      <div className="grid gap-2.5">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              "flex flex-wrap items-start justify-between gap-3 rounded-sm border p-3",
              // Frozen rows carry a distinct amber tint so they don't read
              // as ordinary toggles (tinted surface, not a stripe).
              row.frozen ? "border-amber bg-amberSoft" : "border-line"
            )}
          >
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sans text-sm font-semibold text-ink">
                  {row.label}
                </span>
                <StatusBadge
                  label={row.kindBadge.label}
                  tone={row.kindBadge.tone}
                />
                <StatusBadge
                  label={row.stateBadge.label}
                  tone={row.stateBadge.tone}
                />
              </div>
              <p className="m-0 mt-1 font-sans text-xs leading-snug text-ink2">
                {row.description}
              </p>
              {row.riskNote ? (
                <p
                  className={cn(
                    "m-0 mt-1 font-sans text-xs",
                    row.riskNote.heldOff ? "text-amberText" : "text-ink2"
                  )}
                >
                  {row.riskNote.text}
                </p>
              ) : null}
            </div>
            <FeatureFlagToggleForm
              flagKey={row.key}
              flagLabel={row.label}
              enabled={row.enabled}
              held={row.frozen}
            />
          </div>
        ))}
      </div>
      <FeatureFlagTechnicalNotes />
    </Panel>
  );
}

// The engineering rationale behind the flag kinds (ADR references, RLS
// re-verification, direct-URL route behavior) lives behind a plain disclosure
// — the same native-<details> pattern as HelpAboutDetails — so the default
// Config view reads as an admin console, not internal engineering notes
// (#461). Real cautions stay visible in the rows above; only the rationale
// moves down here.
function FeatureFlagTechnicalNotes() {
  return (
    <details className="rounded-sm border border-line">
      <summary className="lg-sac-summary flex items-center gap-2 px-3 py-2.5 font-sans text-sm font-semibold text-ink2">
        Technical notes — how flags are enforced
      </summary>
      <ul className="m-0 grid gap-1.5 pb-3 pl-7 pr-3 pt-0 font-sans text-xs leading-relaxed text-ink2">
        <li>
          Held flags gate surfaces frozen by ADR 0002. Under ADR 0009&rsquo;s
          verify-before-flip rule the toggle only stores intent; the surface
          turns on once its routes and RLS policies are re-verified, which sets
          a separate verified marker the toggle itself can never write.
        </li>
        <li>
          Nav flags govern the top-level tabs the Care · Plan · Multiply pivot
          (ADR 0016) hides by default — Groups, People, and Planning. The flag
          controls nav visibility only; the routes themselves keep resolving by
          direct URL whether or not the tab is shown.
        </li>
        <li>
          Every flip is a Super-Admin-only write through the audited
          feature-flag action, so each change records a matching audit entry.
        </li>
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Workspace 4 — Diagnostics
// ---------------------------------------------------------------------------

// Read-only usage telemetry: sign-ins and which top-level area each user opens,
// recorded only while the usage_tracking flag is on (the model resolves the flag
// to tell "off" apart from "on but quiet"). Computed server-side from the recent
// usage_events + the loaded profile map — no client interactivity needed; the
// tallies and empty-state branching live in the pure usage model.
function UsagePanel({ data }: { data: SuperAdminConsoleData }) {
  const usage = buildUsagePanelModel({
    events: data.usageEvents,
    profilesById: data.profilesById,
    featureFlags: data.appConfig.featureFlags,
  });

  return (
    <Panel id="usage">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <PanelTitle>Usage &amp; logins</PanelTitle>
        <StatusBadge
          label={usage.trackingOn ? "Tracking on" : "Tracking off"}
          tone={usage.trackingOn ? "active" : "disabled"}
        />
      </div>
      <p className="m-0 font-sans text-sm text-ink2">
        Coarse usage telemetry — sign-ins and which top-level area each user
        opens. Recording is gated by the{" "}
        <strong>Usage &amp; login tracking</strong> flag in Config → Feature
        flags; while it&rsquo;s off, nothing is recorded. Areas are structural
        facts only (which surface), never the content a user viewed.
      </p>

      {usage.emptyState === "tracking-off" ? (
        <p className="m-0 font-sans text-sm text-ink3">
          Tracking is off and nothing has been recorded. Turn on{" "}
          <strong>Usage &amp; login tracking</strong> in Config → Feature flags
          to start seeing logins and area usage here.
        </p>
      ) : usage.emptyState === "tracking-on" ? (
        <p className="m-0 font-sans text-sm text-ink3">
          Tracking is on. No activity has been recorded yet — events will appear
          here as users sign in and move around the app.
        </p>
      ) : (
        <>
          <div className={CARD_GRID_CLASS}>
            <div className="grid gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-3">
              <MetricRow label="Sign-ins" value={usage.loginCount} />
              <MetricRow label="Area opens" value={usage.areaViewCount} />
              <MetricRow label="People seen" value={usage.peopleSeenCount} />
            </div>
          </div>

          <div className={cn(TWO_CARD_GRID_CLASS, "items-start")}>
            <div className="grid min-w-0 gap-2">
              <SubsectionHeader
                title="Areas opened"
                hint="How often each top-level area was entered, busiest first."
              />
              {usage.areaRows.length === 0 ? (
                <p className="m-0 font-sans text-sm text-ink3">
                  No area views recorded yet.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {usage.areaRows.map((row) => (
                    <div key={row.area} className="grid gap-1">
                      <div className="flex justify-between gap-3 font-sans text-xs text-ink2">
                        <span>{row.label}</span>
                        <strong className="text-ink">{row.count}</strong>
                      </div>
                      <div
                        aria-hidden
                        className="h-1.5 overflow-hidden rounded-pill bg-lineSoft"
                      >
                        <div
                          className="h-full bg-sage"
                          style={{ width: `${row.barPercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid min-w-0 gap-2">
              <SubsectionHeader
                title="Recent sign-ins"
                hint="The latest logins, newest first."
              />
              {usage.recentLogins.length === 0 ? (
                <p className="m-0 font-sans text-sm text-ink3">
                  No sign-ins recorded yet.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {usage.recentLogins.map((login) => (
                    <div
                      key={login.id}
                      className="flex justify-between gap-3 font-sans text-xs text-ink2"
                    >
                      <span className="truncate font-semibold text-ink">
                        {login.name}
                      </span>
                      <span className="whitespace-nowrap">{login.at} UTC</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function DiagnosticsWorkspace({
  data,
  testAccountsPanel,
}: {
  data: SuperAdminConsoleData;
  testAccountsPanel: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <WorkspaceHeader
        title="Diagnostics"
        description="Read-only health checks, usage telemetry, plus test tools kept separate from the normal app."
      />
      {/* Safe reads grouped apart from the admin-impacting test-account
          actions, so an operator can tell at a glance which half changes
          nothing (#458). */}
      <section aria-label="Read-only checks" className="grid gap-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <SubsectionHeader
            title="Read-only checks"
            hint="Safe to look at anytime — nothing on this half changes the app."
          />
          <StatusBadge label="Read-only" tone="readonly" />
        </div>
        <SystemStatusChecklist rows={data.checklist} />
        <UsagePanel data={data} />
      </section>
      {/* Admin-impacting half: an amber "watch" border (no stripe) sets it
          apart from the read-only checks above. */}
      <section
        id="test-tools"
        aria-label="Admin-impacting test tools"
        className="grid gap-3 rounded-lg border border-amber bg-surface p-card"
        style={{ scrollMarginTop: SUPER_ADMIN_STICKY_ANCHOR_OFFSET }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h3 className="m-0 font-display text-lg font-medium text-ink">
            Test tools
          </h3>
          <StatusBadge label="Admin-impacting" tone="warning" />
        </div>
        <p className="m-0 font-sans text-sm text-ink2">
          These tools manage real, known-password login accounts kept separate
          from the normal app. Checking status is a safe read; enabling or
          disabling changes who can sign in and asks for confirmation first. No
          secrets are shown.
        </p>
        {testAccountsPanel}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace 5 — Audit
// ---------------------------------------------------------------------------

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
    return <div className="min-w-0">{auditSection}</div>;
  }

  // The Map-dependent summaries are computed here, server-side, so the client
  // filter receives only flat, serialisable entries (RSC can't ship the Maps).
  // Typed as AuditEntry so the lib model and the client filter can't drift.
  const entries: AuditEntry[] = buildAuditTrailEntries(data.auditEvents, {
    profilesById: data.profilesById,
    membersById: data.membersById,
    groupsById: data.groupsById,
  });

  return (
    <div className="min-w-0">
      <AuditWorkspace entries={entries} fullList={auditSection} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace 6 — Danger Zone
// ---------------------------------------------------------------------------

function DangerWorkspace({ data }: { data: SuperAdminConsoleData }) {
  // Chooser groups ordered by risk (#462), lowest first: launch preparation,
  // then the recoverable history/attention resets, then the audit log, and
  // finally permanent deletion — set apart via the destructive group panel.
  // Grouping, ordering, and labels only; every workflow card, type-to-confirm
  // gate, snapshot, and server action is unchanged.
  const groups: DangerWorkflowGroup[] = [
    {
      id: "launch-preparation",
      label: "Launch preparation",
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
      id: "history-attention-resets",
      label: "History and attention resets",
      // Narrowest reset first: attention (Home cards only), one history
      // category, then all history at once.
      workflows: [
        {
          id: "attention",
          label: "Reset attention",
          riskNote: "Fresh start for the time-based Home cards.",
          node: <AttentionResetCard state={data.attentionResetState} />,
        },
        {
          id: "history-category",
          label: "Reset by category",
          riskNote: "Clear one kind of history at a time.",
          node: <HistoryResetCard state={data.historyResetState} />,
        },
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
      ],
    },
    {
      id: "audit-log-actions",
      label: "Audit log actions",
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
      id: "permanent-deletion",
      label: "Permanent deletion",
      destructive: true,
      workflows: [
        {
          id: "permanent",
          label: "Permanent deletion",
          riskNote:
            "Physically remove a single curated record. Cannot be undone from the app.",
          destructive: true,
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
