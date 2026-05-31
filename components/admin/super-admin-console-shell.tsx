import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/shell";
import { OwnerControlsOverview } from "@/components/admin/owner-controls-overview";
import { AuditTrailSection } from "@/components/admin/audit-trail-section";
import {
  RoleChangeForm,
  type AssignableProfile,
} from "@/components/admin/forms/role-change-form";
import { InviteUserForm } from "@/components/admin/forms/invite-user-form";
import { PlatformConfigTracerForm } from "@/components/admin/forms/platform-config-tracer-form";
import {
  SystemStatusChecklist,
  type ChecklistRow,
} from "@/components/admin/system-status-checklist";
import type { AppConfig } from "@/lib/admin/app-config-decode";
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

export type SuperAdminConsoleData = {
  assignableProfiles: AssignableProfile[];
  inviteUserGroups: { id: string; name: string }[];
  // Phase SAC.1 (#159): decoded Super-Admin-only platform config, backing the
  // console's config tracer. Decodes to built-in defaults when unreadable.
  appConfig: AppConfig;
  auditEvents: AuditEventsRow[];
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

function CommandSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} style={{ display: "grid", gap: 18, scrollMarginTop: 20 }}>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      {children}
    </section>
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
  let legacyStaffViewers = 0;
  let activeProfiles = 0;
  for (const profile of data.profilesById.values()) {
    if (profile.role === "staff_viewer") legacyStaffViewers += 1;
    if (profile.status === "active") activeProfiles += 1;
  }

  return (
    <div className="lg-super-admin-command-layout">
      <SectionRail />

      <div style={{ display: "grid", gap: 36, minWidth: 0 }}>
        {errorCount > 0 ? <ErrorBanner /> : null}

        <CommandSection
          id="overview"
          eyebrow="Overview"
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
              status={{
                label: legacyStaffViewers > 0 ? "Review" : "Good",
                tone: legacyStaffViewers > 0 ? "warning" : "good",
              }}
            >
              <MetricRow label="Active profiles" value={activeProfiles} />
              <MetricRow
                label="Eligible role targets"
                value={data.assignableProfiles.length}
              />
              <MetricRow
                label="Legacy staff_viewer rows"
                value={legacyStaffViewers}
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
            <CommandCard
              title="Legacy role detection"
              description="Legacy staff_viewer rows remain targetable only so operators can migrate them to active roles."
              status={{
                label: legacyStaffViewers > 0 ? "Review" : "Clear",
                tone: legacyStaffViewers > 0 ? "warning" : "good",
              }}
            >
              <MetricRow
                label="Legacy staff_viewer rows"
                value={legacyStaffViewers}
              />
            </CommandCard>
          </div>
          <div style={cardStyle}>
            <RoleChangeForm profiles={data.assignableProfiles} />
          </div>
          <div style={cardStyle}>
            <InviteUserForm groups={data.inviteUserGroups} />
          </div>
        </CommandSection>

        <CommandSection
          id="features"
          eyebrow="Features"
          title="Safe feature visibility controls"
          description="Planned owner controls for allowlisted feature visibility. This phase adds the landing place only."
        >
          <div className="lg-m-grid-stack" style={cardGridStyle}>
            <CommandCard
              title="Module visibility"
              description="Future toggles can hide or disable modules without replacing route guards, RLS, or RPC authorization."
              status={{ label: "Planned", tone: "planned" }}
            />
            <CommandCard
              title="Launch mode"
              description="Future launch status can increase readiness warnings while leaving authorization unchanged."
              status={{ label: "Planned", tone: "planned" }}
            />
            <CommandCard
              title="Maintenance banner"
              description="Future copy can be stored as non-sensitive app settings after migrations and audited RPCs exist."
              status={{ label: "Planned", tone: "planned" }}
            />
          </div>
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
        >
          {testAccountsPanel}
        </CommandSection>

        <div id="audit" style={{ scrollMarginTop: 20 }}>
          <AuditTrailSection
            events={data.auditEvents}
            profilesById={data.profilesById}
            membersById={data.membersById}
            groupsById={data.groupsById}
            error={data.errors.audit}
          />
        </div>

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
          description="Permanent purge tools are intentionally absent in this phase. Future actions require server-side impact summaries, type-to-confirm, and audit rows."
        >
          <div
            style={{
              ...cardStyle,
              background: P.terraSoft,
              borderColor: P.terra,
              display: "grid",
              gap: 10,
            }}
          >
            <StatusBadge label="Blocked" tone="blocked" />
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.terraTextStrong,
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              No purge action, broad delete, raw SQL, schema editor, or auth
              bypass is available from this command center shell.
            </p>
          </div>
        </CommandSection>
      </div>
    </div>
  );
}
