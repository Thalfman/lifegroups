import type { CSSProperties, ReactNode } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { OwnerControlsOverview } from "@/components/admin/owner-controls-overview";
import { AuditTrailSection } from "@/components/admin/audit-trail-section";
import {
  RoleChangeForm,
  type AssignableProfile,
} from "@/components/admin/forms/role-change-form";
import {
  SystemStatusChecklist,
  type ChecklistRow,
} from "@/components/admin/system-status-checklist";
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
  good: { background: P.sageSoft, border: P.sage, color: "#3e4f29" },
  warning: { background: P.mustardSoft, border: P.mustard, color: "#6f4f13" },
  blocked: { background: P.terraSoft, border: P.terra, color: "#7d3621" },
  disabled: { background: P.surface, border: P.line, color: P.ink3 },
  active: { background: P.sageSoft, border: P.sage, color: "#3e4f29" },
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
    <div style={{ ...cardStyle, display: "grid", gap: 10, alignContent: "start" }}>
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
        {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
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

function MetricRow({ label, value }: { label: string; value: string | number }) {
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
      <SectionHeader eyebrow={eyebrow} title={title} description={description} />
      {children}
    </section>
  );
}

function SectionRail() {
  return (
    <nav
      aria-label="Super admin command center sections"
      style={{
        ...cardStyle,
        padding: 12,
        position: "sticky",
        top: 20,
        display: "grid",
        gap: 4,
        alignSelf: "start",
      }}
    >
      {COMMAND_SECTIONS.map((section) => (
        <a
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
        </a>
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
        color: "#7d3621",
      }}
    >
      Some sections could not load. The page below shows what did load; retry in a
      moment or check the database connection.
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
  const checklistWarningCount = data.checklist.filter((row) => row.tone === "warn").length;
  const readinessTone: StatusTone =
    errorCount > 0 || checklistWarningCount > 0 ? "warning" : "good";
  const readinessLabel = readinessTone === "good" ? "Good" : "Warning";
  const profiles = Array.from(data.profilesById.values());
  const legacyStaffViewers = profiles.filter((p) => p.role === "staff_viewer").length;
  const activeProfiles = profiles.filter((p) => p.status === "active").length;

  return (
    <div
      className="lg-m-grid-stack"
      style={{
        display: "grid",
        gridTemplateColumns: "220px minmax(0, 1fr)",
        gap: 24,
      }}
    >
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
              <MetricRow label="Eligible role targets" value={data.assignableProfiles.length} />
              <MetricRow label="Legacy staff_viewer rows" value={legacyStaffViewers} />
            </CommandCard>
            <CommandCard
              title="Test account posture"
              description={testAccountsSummary.description}
              status={{ label: testAccountsSummary.label, tone: testAccountsSummary.tone }}
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
              <MetricRow label="Profiles loaded" value={data.profilesById.size} />
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
              <MetricRow label="Legacy staff_viewer rows" value={legacyStaffViewers} />
            </CommandCard>
          </div>
          <div style={cardStyle}>
            <RoleChangeForm profiles={data.assignableProfiles} />
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
              description="Future owner settings will use allowlisted app_settings keys, typed validation, RPC writes, and audit events."
              status={{ label: "Planned", tone: "planned" }}
            />
            <CommandCard
              title="Ministry operating settings"
              description="Capacity, check-in due timing, and health thresholds stay in the day-to-day admin settings page."
              status={{ label: "Linked", tone: "active" }}
            >
              <a
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
              </a>
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

        <div id="test-tools" style={{ display: "grid", gap: 18, scrollMarginTop: 20 }}>
          <SectionHeader
            eyebrow="Test tools"
            title="Controlled testing tools"
            description="The current test account tooling remains intact and isolated from normal app authorization."
          />
          <CommandCard
            title="Current test account status"
            description={testAccountsSummary.description}
            status={{ label: testAccountsSummary.label, tone: testAccountsSummary.tone }}
          />
          {testAccountsPanel}
        </div>

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
                color: "#7d3621",
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              No purge action, broad delete, raw SQL, schema editor, or auth bypass is
              available from this command center shell.
            </p>
          </div>
        </CommandSection>
      </div>
    </div>
  );
}
