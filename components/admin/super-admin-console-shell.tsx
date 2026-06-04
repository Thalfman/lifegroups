import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/shell";
import { SuperAdminSectionAnchors } from "@/components/admin/super-admin-section-anchors";
import { SuperAdminCollapsibleSection } from "@/components/admin/super-admin-collapsible-section";
import { OwnerControlsOverview } from "@/components/admin/owner-controls-overview";
import { AuditTrailSection } from "@/components/admin/audit-trail-section";
import {
  RoleChangeForm,
  type AssignableProfile,
} from "@/components/admin/forms/role-change-form";
import { InviteUserForm } from "@/components/admin/forms/invite-user-form";
import { PlatformConfigTracerForm } from "@/components/admin/forms/platform-config-tracer-form";
import { FeatureFlagToggleForm } from "@/components/admin/forms/feature-flag-toggle-form";
import { EditableCopyForm } from "@/components/admin/forms/editable-copy-form";
import { ProfileStatusForm } from "@/components/admin/forms/profile-status-form";
import { PasswordResetForm } from "@/components/admin/forms/password-reset-form";
import { CoverageAssignForm } from "@/components/admin/forms/coverage-assign-form";
import { CoverageEndForm } from "@/components/admin/forms/coverage-end-form";
import { PeopleImportForm } from "@/components/admin/forms/people-import-form";
import { CleanSlateCard } from "@/components/admin/clean-slate-card";
import { AuditResetCard } from "@/components/admin/audit-reset-card";
import { PermanentDeleteCard } from "@/components/admin/permanent-delete-card";
import type {
  PermanentDeletionTargetGroup,
  RecentTombstone,
} from "@/lib/supabase/permanent-deletion-reads";
import type {
  CleanSlateImpact,
  CleanSlateLatestSnapshot,
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

const COMMAND_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "access", label: "Access" },
  { id: "people-import", label: "People import" },
  { id: "coverage", label: "Coverage" },
  { id: "features", label: "Features" },
  { id: "settings", label: "Settings" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "test-tools", label: "Test tools" },
  { id: "audit", label: "Audit" },
  { id: "maintenance", label: "Maintenance" },
  { id: "danger-zone", label: "Danger Zone" },
] as const;

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

function CommandCard({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status?: { label: string; tone: StatusTone };
  children?: ReactNode;
}) {
  return (
    <div
      style={{ ...cardStyle, display: "grid", gap: 10, alignContent: "start" }}
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

// Operational sections collapse into the shared native-<details> primitive
// (#261): collapsed by default so the super admin isn't scrolling one long
// page, expandable on click or via an anchor. `accent` marks a high-risk
// section (Danger Zone, Test tools) so it reads as visually separated from
// routine controls. The optional `title` renders the rich section header
// inside; sections that bring their own header (Audit) omit it.
function CommandSection({
  id,
  eyebrow,
  title,
  description,
  children,
  accent,
  defaultOpen = false,
}: {
  id: string;
  eyebrow: string;
  title?: string;
  description?: string;
  children: ReactNode;
  accent?: { label: string; tone: StatusTone };
  defaultOpen?: boolean;
}) {
  const accentStyle = accent ? STATUS_STYLE[accent.tone] : null;
  return (
    <SuperAdminCollapsibleSection
      id={id}
      label={eyebrow}
      defaultOpen={defaultOpen}
      accent={
        accent && accentStyle
          ? {
              border: accentStyle.border,
              color: accentStyle.color,
              badge: <StatusBadge label={accent.label} tone={accent.tone} />,
            }
          : undefined
      }
    >
      {title ? (
        <SectionHeader title={title} description={description ?? ""} />
      ) : null}
      {children}
    </SuperAdminCollapsibleSection>
  );
}

function SectionRail() {
  return (
    <nav
      className="lg-super-admin-section-rail"
      aria-label="Super admin command center sections"
      style={{
        ...cardStyle,
        padding: 12,
        position: "sticky",
        top: 20,
        maxHeight: "calc(100vh - 40px)",
        overflowY: "auto",
        display: "grid",
        gap: 4,
        alignSelf: "start",
      }}
    >
      {COMMAND_SECTIONS.map((section) => (
        <Link
          key={section.id}
          href={`#${section.id}`}
          style={{
            borderRadius: 8,
            color: P.ink2,
            fontFamily: fontSans,
            fontSize: 13,
            fontWeight: 600,
            padding: "9px 10px",
            textDecoration: "none",
          }}
        >
          {section.label}
        </Link>
      ))}
    </nav>
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
      Some sections could not load. The page below shows what did load; retry in
      a moment or check the database connection.
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

  return (
    <div className="lg-super-admin-command-layout">
      <SuperAdminSectionAnchors />
      <SectionRail />

      <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
        {errorCount > 0 ? <ErrorBanner /> : null}

        <CommandSection
          id="overview"
          eyebrow="Overview"
          defaultOpen
          title="Launch readiness at a glance"
          description="Current owner controls organized around readiness, access, diagnostics, test tooling, audit visibility, and guarded maintenance."
        >
          <div className="lg-m-grid-stack" style={cardGridStyle}>
            <CommandCard
              title="Readiness signal"
              description={`${checklistWarningCount} checklist warning${
                checklistWarningCount === 1 ? "" : "s"
              } and ${errorCount} load error${errorCount === 1 ? "" : "s"} from existing reads.`}
              status={{ label: readinessLabel, tone: readinessTone }}
            />
            <CommandCard
              title="Access surface"
              description="Role changes remain limited to active, non-self, non-super-admin profiles."
              status={{ label: "Good", tone: "good" }}
            >
              <MetricRow label="Active profiles" value={activeProfiles} />
              <MetricRow
                label="Eligible role targets"
                value={data.assignableProfiles.length}
              />
            </CommandCard>
            <CommandCard
              title="Initial test-account snapshot"
              description={`${testAccountsSummary.description} Live status updates in the Test tools panel below after any action.`}
              status={{
                label: testAccountsSummary.label,
                tone: testAccountsSummary.tone,
              }}
            />
          </div>
          <OwnerControlsOverview />
        </CommandSection>

        <CommandSection
          id="access"
          eyebrow="Access"
          title="Role workflow and profile oversight"
          description="The existing owner-only role workflow stays narrow: no self role changes, no super-admin assignment, and no legacy no-access product UI."
        >
          <div className="lg-m-grid-stack" style={twoCardGridStyle}>
            <CommandCard
              title="Profile counts"
              description="Read-only counts from the current super-admin data load."
              status={{ label: "Read only", tone: "planned" }}
            >
              <MetricRow
                label="Profiles loaded"
                value={data.profilesById.size}
              />
              <MetricRow label="Groups loaded" value={data.groupsById.size} />
              <MetricRow label="Members loaded" value={data.membersById.size} />
            </CommandCard>
          </div>
          <div style={cardStyle}>
            <RoleChangeForm profiles={data.assignableProfiles} />
          </div>
          <div style={cardStyle}>
            <InviteUserForm groups={data.inviteUserGroups} />
          </div>
          <AccountManagementCard data={data} />
        </CommandSection>

        <CommandSection
          id="people-import"
          eyebrow="People import"
          title="Bulk import people"
          description="Paste CSV to create leader profiles and member records in one audited batch. Parsing + de-duplication happen before any write; skipped rows are reported back."
        >
          <div style={{ ...cardStyle, display: "grid", gap: 12 }}>
            {/* A correctly-shaped empty template the operator can fill in and
                paste straight back (#289). Plain anchor, not a Link, so the
                browser follows the attachment download. */}
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
          </div>
        </CommandSection>

        <CommandSection
          id="coverage"
          eyebrow="Coverage"
          title="Over-Shepherd → Leader coverage"
          description="Assign or end coverage. Edits write to the same coverage records the cadence tiers and over-shepherd scoping already read, so they take effect on those surfaces."
        >
          <CoverageManagementCard data={data} />
        </CommandSection>

        <CommandSection
          id="features"
          eyebrow="Features"
          title="Feature flags"
          description="Toggle feature surfaces. New surfaces toggle freely; frozen surfaces (ADR 0002) resolve OFF while on-but-unverified, so a stale toggle can't re-expose a surface before its routes + RLS are re-verified."
        >
          <FeatureFlagsCard data={data} />
        </CommandSection>

        <CommandSection
          id="settings"
          eyebrow="Settings"
          title="Owner settings and ministry settings links"
          description="Owner-level settings are planned here. Ministry operating thresholds remain in the existing admin settings workflow."
        >
          <div className="lg-m-grid-stack" style={twoCardGridStyle}>
            <CommandCard
              title="Owner settings"
              description="Platform config persists in the Super-Admin-only platform_config store via an audited RPC with a paired audit event. The tracer below round-trips set → persist → read."
              status={
                data.errors.platformConfig
                  ? { label: "Read failed", tone: "blocked" }
                  : { label: "Live", tone: "active" }
              }
            >
              {data.errors.platformConfig ? (
                // The form is intentionally withheld on a failed read: the
                // built-in fallback would render the tracer as empty, and
                // saving that would overwrite the real stored value.
                <p
                  style={{
                    fontFamily: fontBody,
                    fontSize: 12.5,
                    color: P.terraTextStrong,
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Couldn’t load platform config ({data.errors.platformConfig}).
                  Editing is disabled until the config row reads successfully,
                  so a failed read can’t silently overwrite the stored value.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      fontFamily: fontSans,
                      fontSize: 12,
                      color: P.ink2,
                    }}
                  >
                    Current tracer value:{" "}
                    <strong style={{ color: P.ink }}>
                      {data.appConfig.consoleTracerNote
                        ? data.appConfig.consoleTracerNote
                        : "(empty)"}
                    </strong>
                  </div>
                  <PlatformConfigTracerForm
                    value={data.appConfig.consoleTracerNote}
                  />
                </>
              )}
            </CommandCard>
            <CommandCard
              title="Ministry operating settings"
              description="Capacity, check-in due timing, and health thresholds stay in the day-to-day admin settings page."
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
        </CommandSection>

        <CommandSection
          id="diagnostics"
          eyebrow="Diagnostics"
          title="Read-only system diagnostics"
          description="Current diagnostics use the existing status checklist. Later phases can add deeper read-only launch checks."
        >
          <SystemStatusChecklist rows={data.checklist} />
        </CommandSection>

        <CommandSection
          id="test-tools"
          eyebrow="Test tools"
          title="Controlled testing tools"
          description="The current test account tooling remains intact and isolated from normal app authorization."
          accent={{ label: "Isolated", tone: "warning" }}
        >
          {testAccountsPanel}
        </CommandSection>

        {/* Collapsed by default like every operational section (#261), but
            expand when the audit read failed so its inline error isn't hidden
            behind a closed disclosure. */}
        <CommandSection
          id="audit"
          eyebrow="Audit"
          defaultOpen={Boolean(data.errors.audit)}
        >
          <AuditTrailSection
            events={data.auditEvents}
            profilesById={data.profilesById}
            membersById={data.membersById}
            groupsById={data.groupsById}
            error={data.errors.audit}
          />
        </CommandSection>

        <CommandSection
          id="maintenance"
          eyebrow="Maintenance"
          title="Safe maintenance"
          description="Maintenance starts as read-only validators and links to existing admin workflows. Repair actions are not part of this phase."
        >
          <div className="lg-m-grid-stack" style={cardGridStyle}>
            <CommandCard
              title="Data quality validators"
              description="Future validators can surface group, leader, member, and calendar issues before any repair action exists."
              status={{ label: "Planned", tone: "planned" }}
            />
            <CommandCard
              title="Existing workflows first"
              description="Normal fixes continue through Manage Groups, Manage People, calendar pages, and settings."
              status={{ label: "Read only", tone: "planned" }}
            />
            <CommandCard
              title="Audited repairs"
              description="Future repairs must be narrow, server-validated, and audited with exact before and after context."
              status={{ label: "Planned", tone: "planned" }}
            />
          </div>
        </CommandSection>

        <CommandSection
          id="danger-zone"
          eyebrow="Danger Zone"
          title="Guarded permanent actions"
          description="Each action below shows a server-loaded impact summary and is gated behind a type-to-confirm phrase, with a paired audit row. Both are reversible (a snapshot / archive is captured before the purge); raw SQL, schema editing, and auth bypass remain unavailable."
          accent={{ label: "Guarded", tone: "blocked" }}
        >
          <CleanSlateCard
            impact={data.cleanSlateImpact}
            snapshot={data.latestCleanSlateSnapshot}
          />
          <AuditResetCard auditEventCount={data.auditEventCount} />
          <PermanentDeleteCard
            targets={data.permanentDeletionTargets}
            tombstones={data.recentTombstones}
          />
        </CommandSection>
      </div>
    </div>
  );
}

// Phase SAC.3 (#163): per-profile disable / re-enable + password reset. Lists
// every loaded profile except the bootstrap super_admin (which the RPC also
// refuses). The actor's own profile is guarded server-side.
function AccountManagementCard({ data }: { data: SuperAdminConsoleData }) {
  const profiles = Array.from(data.profilesById.values())
    .filter((p) => p.role !== "super_admin")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <div style={{ ...cardStyle, display: "grid", gap: 12 }}>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          fontWeight: 600,
          color: P.ink,
          margin: 0,
        }}
      >
        Account management
      </h3>
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
        <div style={{ display: "grid", gap: 8 }}>
          {profiles.map((p) => (
            <div
              key={p.id}
              className="lg-m-grid-stack"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                border: `1px solid ${P.line}`,
                borderRadius: 8,
                padding: "10px 12px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 13,
                    fontWeight: 600,
                    color: P.ink,
                  }}
                >
                  {p.full_name}{" "}
                  <span style={{ color: P.ink3, fontWeight: 400 }}>
                    ({p.status})
                  </span>
                </div>
                <div
                  style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}
                >
                  {p.email}
                </div>
              </div>
              <div
                style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
              >
                <ProfileStatusForm profileId={p.id} currentStatus={p.status} />
                <PasswordResetForm profileId={p.id} email={p.email} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Phase SAC.4 (#164): current coverage list (with end controls) + the assign
// form.
function CoverageManagementCard({ data }: { data: SuperAdminConsoleData }) {
  return (
    <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
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
    </div>
  );
}

// Phase SAC.2 (#161): real feature-flag list with resolved state + toggles.
function FeatureFlagsCard({ data }: { data: SuperAdminConsoleData }) {
  const flags = data.appConfig.featureFlags;
  return (
    <div style={{ ...cardStyle, display: "grid", gap: 10 }}>
      {FEATURE_FLAG_DEFINITIONS.map((def) => {
        const resolved = resolveFlag(flags, def.key);
        const state = flags[def.key];
        const enabled = state?.enabled === true;
        const frozenUnverified =
          def.kind === "frozen_surface" && enabled && state?.verified !== true;
        return (
          <div
            key={def.key}
            className="lg-m-grid-stack"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              border: `1px solid ${P.line}`,
              borderRadius: 8,
              padding: "10px 12px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: fontSans,
                  fontSize: 13,
                  fontWeight: 600,
                  color: P.ink,
                }}
              >
                {def.label}{" "}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: P.ink3,
                    textTransform: "uppercase",
                  }}
                >
                  {def.kind === "new_surface" ? "new" : "frozen"}
                </span>
              </div>
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 12,
                  color: P.ink2,
                  margin: "2px 0 0",
                  lineHeight: 1.45,
                }}
              >
                {def.description}
              </p>
              <p
                style={{
                  fontFamily: fontSans,
                  fontSize: 12,
                  color: frozenUnverified ? P.terraTextStrong : P.ink2,
                  margin: "4px 0 0",
                }}
              >
                Resolved: {resolved ? "ON" : "OFF"}
                {frozenUnverified ? " · disabled until verified" : ""}
              </p>
            </div>
            <FeatureFlagToggleForm flagKey={def.key} enabled={enabled} />
          </div>
        );
      })}
    </div>
  );
}

// Phase SAC.2 (#162): editable-copy list with current resolved value + editor.
function EditableCopyCard({ data }: { data: SuperAdminConsoleData }) {
  const copy = data.appConfig.editableCopy;
  return (
    <div style={{ ...cardStyle, display: "grid", gap: 12 }}>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          fontWeight: 600,
          color: P.ink,
          margin: 0,
        }}
      >
        Editable copy
      </h3>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Configurable strings. Clearing a value falls back to the built-in
        placeholder.
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {EDITABLE_COPY_DEFINITIONS.map((def) => (
          <div
            key={def.key}
            className="lg-m-grid-stack"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              border: `1px solid ${P.line}`,
              borderRadius: 8,
              padding: "10px 12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontFamily: fontSans,
                  fontSize: 13,
                  fontWeight: 600,
                  color: P.ink,
                }}
              >
                {def.label}
              </div>
            </div>
            <EditableCopyForm
              copyKey={def.key}
              currentValue={resolveCopy(copy, def.key)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
