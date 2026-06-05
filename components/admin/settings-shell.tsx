import { SectionHeader } from "@/components/layout/shell";
import { MetricDefaultsForm } from "@/components/admin/forms/metric-defaults-form";
import { GroupMetricOverridesForm } from "@/components/admin/forms/group-metric-overrides-form";
import { ClearGroupMetricOverridesButton } from "@/components/admin/forms/clear-group-metric-overrides-button";
import { ResetMetricDefaultsButton } from "@/components/admin/forms/reset-metric-defaults-button";
import { EditableCopyForm } from "@/components/admin/forms/editable-copy-form";
import {
  SettingsTabs,
  type SettingsTab,
} from "@/components/admin/settings-tabs";
import { PBadge } from "@/components/pastoral/atoms";
import { PLinkButton } from "@/components/pastoral/button";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { hasActiveOverrides } from "@/lib/admin/metrics";
import type { MetricDefaults } from "@/lib/admin/metrics";
import {
  EDITABLE_COPY_DEFINITIONS,
  GROUP_HEALTH_COPY_KEYS,
  resolveCopy,
  type EditableCopyConfig,
} from "@/lib/admin/editable-copy";
import type { GroupMetricSettingsRow, GroupsRow } from "@/types/database";
import { HealthRubricEditor } from "@/components/admin/settings/health-rubric-editor";
import type { RubricCriterion } from "@/lib/admin/health-rubric";
import {
  MultiplicationConfigEditor,
  type MultiplicationConfigSeed,
} from "@/components/admin/settings/multiplication-config-editor";

export type SettingsShellData = {
  defaults: MetricDefaults;
  defaultsSource: "live" | "fallback";
  groups: GroupsRow[];
  groupMetricSettings: GroupMetricSettingsRow[];
  // #374 / ADR 0018: the current group Health Rubric's criteria (Julian-owned).
  // Empty when no rubric has been built yet; the editor seeds a blank row.
  groupRubricCriteria: RubricCriterion[];
  // #380 Multiplication Pillars: the per-type config seeds (Capacity feed +
  // trigger rubric) for the current ministry year, plus the year itself. Optional
  // so the shell tolerates a build that hasn't wired this read yet.
  multiplicationConfig?: {
    ministryYear: number;
    seeds: MultiplicationConfigSeed[];
  };
  // Issue #304: whether the viewer is the super_admin. Settings is a
  // ministry-admin surface, but two facets stay behind the super-admin
  // boundary: the pastoral editable-copy editor (writes the Super-Admin-only
  // platform_config) and bulk people import (requireSuperAdminSession). For a
  // ministry_admin these tabs surface the capability and deep-link to the
  // Super Admin Console rather than exposing a write path here.
  isSuperAdmin: boolean;
  // Decoded editable copy (group-health question wording + care-status labels)
  // per ADR 0007. Only populated for the super_admin, whose RLS lets the page
  // read platform_config; null for a ministry_admin (who can't read it).
  editableCopy: EditableCopyConfig | null;
  errors: {
    defaults: string | null;
    groups: string | null;
    overrides: string | null;
  };
};

export function SettingsShell({ data }: { data: SettingsShellData }) {
  const settingsByGroupId = new Map(
    data.groupMetricSettings.map((s) => [s.group_id, s])
  );
  const groupsById = new Map(data.groups.map((g) => [g.id, g]));

  const overrideRows = data.groupMetricSettings
    .filter((s) => hasActiveOverrides(s))
    .map((s) => ({ settings: s, group: groupsById.get(s.group_id) ?? null }))
    .filter((row) => row.group !== null)
    .sort((a, b) => (a.group?.name ?? "").localeCompare(b.group?.name ?? ""));

  const anyError =
    data.errors.defaults || data.errors.groups || data.errors.overrides;

  const tabs: SettingsTab[] = [
    {
      id: "general",
      label: "General",
      panel: (
        <GeneralPanel
          isSuperAdmin={data.isSuperAdmin}
          editableCopy={data.editableCopy}
        />
      ),
    },
    {
      id: "thresholds",
      label: "Thresholds",
      panel: (
        <ThresholdsPanel
          data={data}
          settingsByGroupId={settingsByGroupId}
          overrideRows={overrideRows}
        />
      ),
    },
    {
      id: "notifications",
      label: "Notifications",
      panel: <NotificationsPanel />,
    },
    {
      id: "imports",
      label: "Imports",
      panel: <ImportsPanel isSuperAdmin={data.isSuperAdmin} />,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 28 }}>
      {anyError ? (
        <div role="alert" style={alertStyle}>
          Some sections couldn&rsquo;t load. The page below shows what we did
          get; retry in a moment or check the database connection.
        </div>
      ) : null}

      {data.defaultsSource === "fallback" ? (
        <div style={infoStyle}>
          Showing built-in defaults — the live <code>metric_defaults</code> row
          either wasn&rsquo;t loaded or hasn&rsquo;t been seeded yet. Saving
          will create or repair it.
        </div>
      ) : null}

      {/* Thresholds is the default tab: it carries the metric defaults an
          operator changes most, and the Settings a11y spec inspects those
          fields on load. */}
      <SettingsTabs tabs={tabs} defaultTabId="thresholds" />
    </div>
  );
}

// Thresholds tab (#304): care stale-contact days, capacity warnings, and health
// thresholds grouped together — these all live in the single MetricDefaultsForm
// (primary defaults always visible; capacity/attendance/group-health thresholds
// behind the Advanced thresholds disclosure). The rarely-used per-group
// overrides stay demoted into their own collapsed disclosure below.
function ThresholdsPanel({
  data,
  settingsByGroupId,
  overrideRows,
}: {
  data: SettingsShellData;
  settingsByGroupId: Map<string, GroupMetricSettingsRow>;
  overrideRows: { settings: GroupMetricSettingsRow; group: GroupsRow | null }[];
}) {
  return (
    <div style={{ display: "grid", gap: 36 }}>
      {/* #374 / ADR 0018: the Group Health Rubric — Julian's weighted criteria
          that roll up to an A–F grade. Owned here in Settings (Ministry-Admin),
          not the Super Admin Console. Save is gated on the weights totalling
          100, enforced both in the editor and the audited RPC. */}
      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Group Health Rubric"
          title="How a group is graded"
          description="Name the criteria a group is graded on and set each one's weight. The weights must total 100. Grades roll up to an A–F letter; a manual override can still force the letter."
        />
        <Card>
          <HealthRubricEditor criteria={data.groupRubricCriteria} />
        </Card>
      </section>

      {/* #380 Multiplication Pillars: the Ministry-Admin-fed Capacity per type +
          the trigger rubric that decides when a type is ready to multiply. Feeds
          the Multiply boards directly; capacity here is the fed source, never
          in-app counts. */}
      {data.multiplicationConfig ? (
        <section style={{ display: "grid", gap: 18 }}>
          <SectionHeader
            eyebrow="Multiplication pillars"
            title="When a group type is ready to multiply"
            description="Feed each type's capacity (it is not derived from in-app counts) and set the trigger — the minimum pillar grades a type must clear before it counts as ready to multiply. A full group can be flagged to multiply on its own."
          />
          <Card>
            <MultiplicationConfigEditor
              seeds={data.multiplicationConfig.seeds}
              ministryYear={data.multiplicationConfig.ministryYear}
            />
          </Card>
        </section>
      ) : null}

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Global metric defaults"
          title="The thresholds that flag warnings"
          description="Set the ministry-wide defaults the dashboard uses for capacity, attendance health, and leader-care cadence. Per-group overrides below take precedence when needed."
        />
        <Card>
          <MetricDefaultsForm defaults={data.defaults} />
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: `1px solid ${P.line}`,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                maxWidth: 380,
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              <strong style={{ color: P.ink, fontWeight: 600 }}>
                Need a clean slate?
              </strong>{" "}
              Reset the baseline thresholds back to the ministry defaults.
              You&rsquo;ll be asked to confirm first.
            </div>
            <ResetMetricDefaultsButton />
          </div>
        </Card>
      </section>

      {/* S1 (#221): per-group overrides and the active-overrides list are the
          rarely-used part of Settings, so they're demoted into one collapsed
          disclosure. Native <details> keeps this a server component (works
          without JS); the count in the summary tells an operator whether any
          overrides are in effect before they expand it. */}
      <details style={detailsStyle}>
        <summary style={summaryStyle}>
          Per-group overrides
          <span style={summaryCountStyle}>
            {overrideRows.length === 0
              ? "none active"
              : `${overrideRows.length} active`}
          </span>
        </summary>

        <div style={{ display: "grid", gap: 36, marginTop: 24 }}>
          <section style={{ display: "grid", gap: 18 }}>
            <SectionHeader
              eyebrow="Group-specific overrides"
              title="Per-group adjustments"
              description="Override capacity or attendance thresholds for a single group, pin a manual health label, or exclude a launch group from capacity warnings."
            />
            <Card>
              <GroupMetricOverridesForm
                groups={data.groups}
                settingsByGroupId={settingsByGroupId}
              />
            </Card>
          </section>

          <section style={{ display: "grid", gap: 14 }}>
            <SectionHeader
              eyebrow="Currently overridden"
              title="Groups with active overrides"
              description="Each line shows the overrides currently in effect. Clear them to fall back to the global defaults."
            />
            {overrideRows.length === 0 ? (
              <Empty
                title="No active overrides"
                description="Every group is following the global defaults above."
              />
            ) : (
              <ul style={listResetStyle}>
                {overrideRows.map(({ group, settings }) =>
                  group ? (
                    <li key={settings.group_id} style={{ marginBottom: 12 }}>
                      <OverrideSummaryRow group={group} settings={settings} />
                    </li>
                  ) : null
                )}
              </ul>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}

// General tab (#304): basic ministry/app defaults. Owns the Julian pastoral copy
// per ADR 0007 — the two Group-Health question wordings and the five care-status
// labels. Editing those writes the Super-Admin-only platform_config via a
// super-admin RPC, so the editor renders only for the super_admin; a
// ministry_admin sees a clear pointer to the Super Admin Console rather than a
// write path that the RLS would reject anyway (no data-model change).
function GeneralPanel({
  isSuperAdmin,
  editableCopy,
}: {
  isSuperAdmin: boolean;
  editableCopy: EditableCopyConfig | null;
}) {
  return (
    <div style={{ display: "grid", gap: 36 }}>
      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Pastoral wording"
          title="Group-health questions & care-status labels"
          description="The wording leaders see on the group-health check-in and the labels used across the care dashboard. Keep them in the ministry's own voice."
        />
        {isSuperAdmin ? (
          <Card>
            <div style={{ display: "grid", gap: 10 }}>
              {EDITABLE_COPY_DEFINITIONS.map((def) => {
                const isGroupHealth =
                  def.key === GROUP_HEALTH_COPY_KEYS.spiritualGrowth ||
                  def.key === GROUP_HEALTH_COPY_KEYS.groupQuestion;
                const inputId = `copy-${def.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                return (
                  <div
                    key={def.key}
                    className="lg-m-grid-stack"
                    style={copyRowStyle}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <label htmlFor={inputId} style={copyLabelStyle}>
                        {def.label}
                      </label>
                      <div style={copyTagStyle}>
                        {isGroupHealth
                          ? "Group-health question"
                          : "Care-status label"}
                      </div>
                    </div>
                    <EditableCopyForm
                      copyKey={def.key}
                      inputId={inputId}
                      currentValue={resolveCopy(editableCopy ?? {}, def.key)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <Card>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                margin: "0 0 14px",
                lineHeight: 1.55,
              }}
            >
              The group-health question wording and care-status labels are
              edited in the Super Admin Console. Ask the super admin to adjust
              them there; the changes take effect everywhere these labels
              appear.
            </p>
            <PLinkButton href="/admin/super-admin" tone="ghost" size="sm">
              Open Super Admin Console →
            </PLinkButton>
          </Card>
        )}
      </section>
    </div>
  );
}

// Notifications tab (#304): no notification/reminder settings exist yet, so we
// show an honest empty state rather than fabricating controls.
function NotificationsPanel() {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Notifications"
        title="Reminder & email preferences"
        description="Where reminder and email preferences will live once they ship."
      />
      <Empty
        title="No notification settings yet"
        description="There aren't any reminder or email preferences to configure right now. This tab is reserved for them so they land in a predictable place."
      />
    </div>
  );
}

// Imports tab (#304): a navigation/discoverability surface only. Bulk people
// import is a security-critical write path gated by requireSuperAdminSession()
// in the Super Admin Console — that boundary is unchanged. This tab deep-links
// to that surface for the super_admin and explains the gate to a ministry_admin;
// it introduces NO normal-admin write path.
function ImportsPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Imports"
        title="Bulk people import"
        description="Import tools for getting people into the system in bulk."
      />
      <Card>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: "0 0 14px",
            lineHeight: 1.55,
          }}
        >
          Bulk people import is a guarded write path and stays in the Super
          Admin Console.{" "}
          {isSuperAdmin
            ? "Open the console to run an import."
            : "Only the super admin can run an import; ask them if you need people loaded in bulk."}
        </p>
        {isSuperAdmin ? (
          <PLinkButton
            href="/admin/super-admin#people-import"
            tone="ghost"
            size="sm"
          >
            Open import in Super Admin Console →
          </PLinkButton>
        ) : null}
      </Card>
    </div>
  );
}

function OverrideSummaryRow({
  group,
  settings,
}: {
  group: GroupsRow;
  settings: GroupMetricSettingsRow;
}) {
  const chips: {
    key: string;
    label: string;
    tone?: "neutral" | "watch" | "followup";
  }[] = [];
  if (settings.capacity_override != null)
    chips.push({ key: "cap", label: `Capacity ${settings.capacity_override}` });
  if (settings.capacity_warning_threshold_pct_override != null)
    chips.push({
      key: "warn",
      label: `Warning ${settings.capacity_warning_threshold_pct_override}%`,
    });
  if (settings.healthy_attendance_pct_override != null)
    chips.push({
      key: "att",
      label: `Healthy ≥ ${settings.healthy_attendance_pct_override}%`,
    });
  if (settings.manual_health_status_override) {
    chips.push({
      key: "health",
      label: `Health: ${settings.manual_health_status_override.replace(/_/g, " ")}`,
      tone: "watch",
    });
  }
  if (settings.exclude_from_capacity_metrics)
    chips.push({
      key: "ex",
      label: "Excluded from capacity",
      tone: "followup",
    });
  if (
    settings.admin_metric_notes &&
    settings.admin_metric_notes.trim().length > 0
  )
    chips.push({ key: "note", label: "Has notes" });

  return (
    <article
      className="lg-m-grid-stack"
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "14px 18px",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 16,
            color: P.ink,
            fontWeight: 500,
          }}
        >
          {group.name}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 8,
          }}
        >
          {chips.map((c) => (
            <PBadge key={c.key} tone={c.tone ?? "neutral"}>
              {c.label}
            </PBadge>
          ))}
        </div>
        {settings.admin_metric_notes &&
        settings.admin_metric_notes.trim().length > 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              margin: "10px 0 0",
              lineHeight: 1.5,
            }}
          >
            {settings.admin_metric_notes}
          </p>
        ) : null}
      </div>
      <ClearGroupMetricOverridesButton
        groupId={group.id}
        groupName={group.name}
      />
    </article>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "18px 22px",
      }}
    >
      {children}
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px dashed ${P.line}`,
        borderRadius: 10,
        padding: "22px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 16,
          color: P.ink,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  );
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

const copyRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  border: `1px solid ${P.line}`,
  borderRadius: 8,
  padding: "12px 14px",
  flexWrap: "wrap" as const,
} as const;

const copyLabelStyle = {
  display: "block",
  fontFamily: fontSans,
  fontSize: 13,
  fontWeight: 600,
  color: P.ink,
  marginBottom: 4,
} as const;

const copyTagStyle = {
  fontFamily: fontBody,
  fontSize: 11,
  color: P.ink3,
} as const;

const detailsStyle = {
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  padding: "16px 20px",
  background: P.surface,
} as const;

const summaryStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: 10,
  flexWrap: "wrap" as const,
  fontFamily: fontDisplay,
  fontSize: 18,
  fontWeight: 500,
  color: P.ink,
  cursor: "pointer",
};

const summaryCountStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  fontWeight: 400,
  color: P.ink3,
} as const;

const alertStyle = {
  background: P.terraSoft,
  border: `1px solid ${P.terra}`,
  borderRadius: 8,
  padding: "12px 14px",
  fontFamily: fontBody,
  fontSize: 13,
  color: "#7d3621",
} as const;

const infoStyle = {
  background: P.bg,
  border: `1px solid ${P.line}`,
  borderRadius: 8,
  padding: "12px 14px",
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink3,
  fontStyle: "italic",
} as const;
