import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { SectionHeader } from "@/components/layout/shell";
import { Card, Pill, type PillTone } from "@/components/pastoral/primitives";
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

// Sections in the rail are reordered for Phase 2 hierarchy:
// orientation → diagnostics → operational standard → access → audit
// → planned/info. The rail copy stays scannable for the rare full-page
// scroll.
const COMMAND_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "test-tools", label: "Test accounts" },
  { id: "access", label: "Role management" },
  { id: "audit", label: "Audit trail" },
  { id: "features", label: "Feature visibility" },
  { id: "settings", label: "Settings" },
  { id: "maintenance", label: "Maintenance" },
  { id: "danger-zone", label: "Danger Zone" },
] as const;

// Maps the super-admin "StatusTone" labels (good/warning/blocked/…) onto
// the shared Pill primitive's tone system so every status chip in the
// command center renders from one design vocabulary.
function pillToneFor(status: StatusTone): PillTone {
  switch (status) {
    case "good":
    case "active":
      return "sage";
    case "warning":
      return "amber";
    case "blocked":
      return "clay";
    case "planned":
      return "neutral";
    case "disabled":
    default:
      return "ghost";
  }
}

function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  return <Pill tone={pillToneFor(tone)}>{label}</Pill>;
}

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
    <Card padded={false} style={{ padding: "18px 20px", display: "grid", gap: 10, alignContent: "start" }}>
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
            fontFamily: "var(--font-display)",
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: -0.2,
            color: "var(--c-ink)",
            margin: 0,
            lineHeight: 1.25,
          }}
        >
          {title}
        </h3>
        {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
      </div>
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--c-ink2)",
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {description}
      </p>
      {children}
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontFamily: "var(--font-body)",
        fontSize: 12.5,
        color: "var(--c-ink2)",
      }}
    >
      <span>{label}</span>
      <strong style={{ color: "var(--c-ink)", fontWeight: 600 }}>{value}</strong>
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
      className="lg-super-admin-section-rail"
      aria-label="Super admin command center sections"
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-line)",
        borderRadius: 14,
        padding: 8,
        position: "sticky",
        top: 20,
        maxHeight: "calc(100vh - 40px)",
        overflowY: "auto",
        display: "grid",
        gap: 2,
        alignSelf: "start",
        boxShadow: "var(--c-shadow)",
      }}
    >
      {COMMAND_SECTIONS.map((section) => (
        <Link
          key={section.id}
          href={`#${section.id}`}
          style={{
            borderRadius: 8,
            color: "var(--c-ink2)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: 500,
            padding: "9px 12px",
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
        background: "var(--c-claySoft)",
        border: "1px solid var(--c-clay)",
        borderRadius: 10,
        padding: "12px 14px",
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--c-clay)",
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
          title="Owner & operator control plane"
          description="A quiet console for the owner account. The cards below summarize readiness, access, and the test-tooling pattern that newer operational controls will follow."
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
              title="Test accounts snapshot"
              description={`${testAccountsSummary.description} Live status updates in the Test accounts panel below after any action.`}
              status={{ label: testAccountsSummary.label, tone: testAccountsSummary.tone }}
            />
          </div>
          <OwnerControlsOverview />
        </CommandSection>

        <CommandSection
          id="diagnostics"
          eyebrow="Diagnostics"
          title="System status checklist"
          description="Foundational data and audit-access readout. Useful after a fresh deploy or seed. Deeper read-only launch checks can be added in a later phase."
        >
          <SystemStatusChecklist rows={data.checklist} />
        </CommandSection>

        <CommandSection
          id="test-tools"
          eyebrow="Test accounts"
          title="Operational standard for future controls"
          description="Test-account tooling stays isolated from normal app authorization. Its status / refresh / diagnose / enable / disable layout is the visual standard newer operational controls will follow."
        >
          {testAccountsPanel}
        </CommandSection>

        <CommandSection
          id="access"
          eyebrow="Role management"
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
          <Card padded={false} style={{ padding: "18px 20px" }}>
            <RoleChangeForm profiles={data.assignableProfiles} />
          </Card>
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
          id="features"
          eyebrow="Feature visibility"
          title="Safe feature visibility controls"
          description="Planned owner controls for allowlisted feature visibility. This phase keeps the landing place only — no new toggles ship yet."
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
              <Link
                href="/admin/settings"
                style={{
                  color: "var(--c-clay)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Open admin settings →
              </Link>
            </CommandCard>
          </div>
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
          title="No destructive actions in this release"
          description="Permanent purge tools, hard deletes, raw SQL, schema editors, and auth bypasses are intentionally absent. Any future destructive action will require server-side impact summaries, type-to-confirm, and audit rows."
        >
          <Card
            padded={false}
            style={{
              padding: "16px 20px",
              background: "var(--c-claySoft)",
              borderColor: "var(--c-clay)",
              display: "grid",
              gap: 10,
            }}
          >
            <StatusBadge label="Blocked" tone="blocked" />
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--c-clay)",
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              No purge action, broad delete, raw SQL, schema editor, or auth bypass is
              available from this command center shell.
            </p>
          </Card>
        </CommandSection>
      </div>
    </div>
  );
}
