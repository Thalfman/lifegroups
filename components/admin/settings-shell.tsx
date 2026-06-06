import { SectionHeader } from "@/components/layout/shell";
import { MetricDefaultsForm } from "@/components/admin/forms/metric-defaults-form";
import { GroupMetricOverridesForm } from "@/components/admin/forms/group-metric-overrides-form";
import { ClearGroupMetricOverridesButton } from "@/components/admin/forms/clear-group-metric-overrides-button";
import { ResetMetricDefaultsButton } from "@/components/admin/forms/reset-metric-defaults-button";
import {
  SettingsTabs,
  type SettingsTab,
} from "@/components/admin/settings-tabs";
import { PBadge } from "@/components/pastoral/atoms";
import { PLinkButton } from "@/components/pastoral/button";
import { P, fontBody, fontDisplay } from "@/lib/pastoral";
import { hasActiveOverrides } from "@/lib/admin/metrics";
import type { MetricDefaults } from "@/lib/admin/metrics";
import type { GroupMetricSettingsRow, GroupsRow } from "@/types/database";
import { HealthRubricEditor } from "@/components/admin/settings/health-rubric-editor";
import type { RubricCriterion } from "@/lib/admin/health-rubric";
import {
  MultiplicationConfigEditor,
  type MultiplicationConfigSeed,
} from "@/components/admin/settings/multiplication-config-editor";
import { GroupsCatalogEditor } from "@/components/admin/settings/groups-catalog-editor";
import type { CategoryMatrix } from "@/lib/admin/group-category-matrix";
import type { CellCoverage } from "@/lib/admin/cell-coverage";

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
  // #378 / ADR 0018: the current Leader-Health Rubric's criteria — the symmetric
  // per-leader rubric, same editor parameterized to the "leader" kind. Empty
  // until Julian builds it.
  leaderRubricCriteria: RubricCriterion[];
  // #396 Settings > Groups: the type×category matrix — rows = catalog categories,
  // columns = the three top types — with each cell's active flag. Built purely
  // from the catalog + cell reads; empty rows when the catalog is empty (fresh
  // ministry) or the reads failed (see errors.groupCategories).
  categoryMatrix: CategoryMatrix;
  // #400 Settings > Groups: per-active-cell coverage ("have X of Y"), already
  // sorted by largest shortfall. Feeds both the inline readout (matched to its
  // matrix cell by audience + category) and the dedicated coverage panel. Empty
  // when no cell is active or the reads failed (see errors.groupCategories).
  cellCoverage: CellCoverage[];
  // Issue #304: whether the viewer is the super_admin. Settings is a
  // ministry-admin surface, but bulk people import stays behind the super-admin
  // boundary (requireSuperAdminSession). For a ministry_admin the System tab
  // surfaces that capability and deep-links to the Super Admin Console rather
  // than exposing a write path here.
  isSuperAdmin: boolean;
  errors: {
    defaults: string | null;
    groups: string | null;
    overrides: string | null;
    // #380 / #378 / #374: a transient read failure for the multiplication config
    // or either health rubric must surface (not silently fall back to default
    // seeds / a blank rubric), so an admin save can't overwrite config that
    // merely failed to load. It also lets a section that can't load — e.g. on an
    // environment whose pivot tables aren't migrated yet — render a calm
    // "not set up yet" placeholder in place of its editor, rather than tripping a
    // page-wide error banner.
    multiplication: string | null;
    groupRubric: string | null;
    leaderRubric: string | null;
    // #396: a single transient-read failure key for the Groups tab's catalog +
    // cell reads, so an unmigrated environment softens to a placeholder.
    groupCategories: string | null;
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

  // Settings is organized around the Care/Plan/Multiply spine (ADR 0016): Care
  // owns the rubrics that grade leaders/groups, Multiply owns the per-type
  // pillar config, and the older dashboard-warning number knobs are demoted to
  // their own Thresholds tab. Plan carries no configuration today, so it has no
  // tab.
  const tabs: SettingsTab[] = [
    {
      id: "care",
      label: "Care",
      panel: <CarePanel data={data} />,
    },
    {
      id: "groups",
      label: "Groups",
      panel: <GroupsPanel data={data} />,
    },
    {
      id: "multiply",
      label: "Multiply",
      panel: <MultiplyPanel data={data} />,
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
      id: "system",
      label: "System",
      panel: <SystemPanel isSuperAdmin={data.isSuperAdmin} />,
    },
  ];

  return (
    <div style={{ display: "grid", gap: 28 }}>
      {data.defaultsSource === "fallback" ? (
        <div style={infoStyle}>
          Showing built-in defaults — the live <code>metric_defaults</code> row
          either wasn&rsquo;t loaded or hasn&rsquo;t been seeded yet. Saving
          will create or repair it.
        </div>
      ) : null}

      {/* Care is the default tab: it carries the rubrics that define how leaders
          and groups are graded — the heart of what Settings configures now (ADR
          0016). A section whose data failed to load (e.g. an environment without
          the pivot tables) softens to a calm "not set up yet" placeholder rather
          than tripping a page-wide error. */}
      <SettingsTabs tabs={tabs} defaultTabId="care" />
    </div>
  );
}

// Care tab: the rubrics that define how leaders and groups are graded — the
// configuration at the heart of Care (ADR 0016). The two A–F Health Rubrics
// (group + leader; #374/#378, ADR 0018) live here. A rubric whose read failed —
// e.g. on an environment whose pivot tables aren't migrated yet — softens to a
// calm "not set up yet" placeholder instead of an editor that couldn't save.
function CarePanel({ data }: { data: SettingsShellData }) {
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
          description="Name the criteria and set each weight; they must total 100."
        />
        {data.errors.groupRubric ? (
          <NotConfigured subject="The Group Health Rubric" />
        ) : (
          <Card>
            <HealthRubricEditor criteria={data.groupRubricCriteria} />
          </Card>
        )}
      </section>

      {/* #378 / ADR 0018 (pivot slice 5): the Leader-Health Rubric — the
          symmetric per-leader weighted criteria that roll up to an A–F
          Leader-Health Grade entered in Care. Same editor, parameterized to the
          "leader" kind; same weight-to-100 gate. A deliberate FOURTH "health"
          concept, distinct from Leader Care Status and the Health Pulse. */}
      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Leader Health Rubric"
          title="How a leader is graded"
          description="Name the criteria and set each weight; they must total 100. Distinct from a leader's Care Status."
        />
        {data.errors.leaderRubric ? (
          <NotConfigured subject="The Leader Health Rubric" />
        ) : (
          <Card>
            <HealthRubricEditor
              criteria={data.leaderRubricCriteria}
              kind="leader"
              subjectLabel="leader"
            />
          </Card>
        )}
      </section>
    </div>
  );
}

// Groups tab (#396 / PRD §2.1, §2.7): the foundation of the groups overhaul —
// the free-form category catalog and the (top type × category) matrix of active
// cells. An admin defines free-form labels, then applies a label to one or more
// top types; applying activates that cell, the live unit everything downstream
// (target, capacity, interest, readiness) hangs off in later slices. Care stays
// the default tab; this tab is new. Softens to a placeholder when its reads fail
// (e.g. an environment whose groups tables aren't migrated yet).
function GroupsPanel({ data }: { data: SettingsShellData }) {
  return (
    <div style={{ display: "grid", gap: 36 }}>
      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Group categories"
          title="Categories and the type grid"
          description="Define free-form category labels, then apply each to the top types it belongs under. Applying a category to a type activates that cell."
        />
        {data.errors.groupCategories ? (
          <NotConfigured subject="Group categories" />
        ) : (
          <Card>
            <GroupsCatalogEditor
              matrix={data.categoryMatrix}
              cellCoverage={data.cellCoverage}
            />
          </Card>
        )}
      </section>

      {/* #400 / PRD §2.3: the dedicated coverage panel. Every ACTIVE cell with its
          gap (target − have), sorted by largest shortfall so the cells most short
          of their target read first. Targets are tracking only — this is a
          read-only readout, not a trigger. Hidden when no cell is active yet (or
          the reads failed, which the placeholder above already covers). */}
      {!data.errors.groupCategories && data.cellCoverage.length > 0 ? (
        <section style={{ display: "grid", gap: 18 }}>
          <SectionHeader
            eyebrow="Coverage"
            title="Where groups are short of target"
            description="Each active cell's current count against its target, largest shortfall first. Counts active and launching groups only."
          />
          <Card>
            <CellCoveragePanel rows={data.cellCoverage} />
          </Card>
        </section>
      ) : null}
    </div>
  );
}

// #400: the dedicated coverage panel — a read-only table of every active cell's
// "have X of Y" with its gap, already sorted by largest shortfall upstream. A
// cell that has met (or exceeded) its target reads gap 0 / "On target".
function CellCoveragePanel({ rows }: { rows: CellCoverage[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={coverageTableStyle}>
        <thead>
          <tr>
            <th style={{ ...coverageThStyle, textAlign: "left" }} scope="col">
              Cell
            </th>
            <th style={coverageThStyle} scope="col">
              Have
            </th>
            <th style={coverageThStyle} scope="col">
              Target
            </th>
            <th style={coverageThStyle} scope="col">
              Gap
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.audienceCategory}:${row.categoryId}`}>
              <td style={{ ...coverageTdStyle, textAlign: "left" }}>
                <span style={{ fontWeight: 500, color: P.ink }}>
                  {row.label}
                </span>
                <span style={{ color: P.ink3 }}>
                  {" "}
                  · {COVERAGE_TYPE_LABEL[row.audienceCategory]}
                </span>
              </td>
              <td style={coverageTdStyle}>{row.have}</td>
              <td style={coverageTdStyle}>{row.target}</td>
              <td style={coverageTdStyle}>
                {row.gap === 0 ? (
                  <span style={{ color: P.ink3 }}>On target</span>
                ) : (
                  <strong style={{ color: P.ink }}>−{row.gap}</strong>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COVERAGE_TYPE_LABEL: Record<"men" | "women" | "mixed", string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

const coverageTableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontFamily: fontBody,
  fontSize: 13,
} as const;

const coverageThStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  fontWeight: 600,
  color: P.ink3,
  textAlign: "center" as const,
  padding: "8px 12px",
  borderBottom: `1px solid ${P.line}`,
  whiteSpace: "nowrap" as const,
} as const;

const coverageTdStyle = {
  padding: "10px 12px",
  borderBottom: `1px solid ${P.line}`,
  textAlign: "center" as const,
  color: P.ink2,
} as const;

// Multiply tab (#380): the per-type Multiplication Pillars — Julian's fed
// Capacity per type plus the trigger rubric that decides when a group type is
// ready to multiply. Feeds the Multiply boards directly; capacity here is the
// fed source, never in-app counts. Softens to a placeholder when its config
// couldn't load.
function MultiplyPanel({ data }: { data: SettingsShellData }) {
  return (
    <div style={{ display: "grid", gap: 36 }}>
      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Multiplication pillars"
          title="When a group type is ready to multiply"
          description="Feed each type's capacity and set the trigger that marks it ready to multiply."
        />
        {data.errors.multiplication || !data.multiplicationConfig ? (
          <NotConfigured subject="The Multiplication pillars" />
        ) : (
          <Card>
            <MultiplicationConfigEditor
              seeds={data.multiplicationConfig.seeds}
              ministryYear={data.multiplicationConfig.ministryYear}
            />
          </Card>
        )}
      </section>
    </div>
  );
}

// Thresholds tab: the older dashboard-warning number knobs — capacity, attendance
// health, and leader-care cadence — that still drive the metric warnings on the
// (flagged-off) number surfaces. They all live in the single MetricDefaultsForm
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
      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Global metric defaults"
          title="The thresholds that flag warnings"
          description="Ministry-wide defaults for capacity, attendance health, and leader-care cadence."
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
              Reset the thresholds to the ministry defaults.
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
              description="Override thresholds or health labels for a single group."
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
              description="Clear an override to fall back to the global defaults."
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

// System tab: utility pointers that aren't part of Care/Plan/Multiply config.
// Bulk people import is a security-critical write path gated by
// requireSuperAdminSession() in the Super Admin Console — that boundary is
// unchanged. This tab deep-links to that surface for the super_admin and
// explains the gate to a ministry_admin; it introduces NO normal-admin write
// path. Future reminder/email preferences will also land here.
function SystemPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Imports"
        title="Bulk people import"
        description="Tools for loading people in bulk."
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
          Bulk import stays in the Super Admin Console.{" "}
          {isSuperAdmin
            ? "Open the console to run an import."
            : "Only the super admin can run one."}
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

// A calm placeholder for a configuration section whose data couldn't load —
// typically because the feature's tables aren't provisioned in this environment
// yet (the pivot is mid-migration). It reads as "coming soon," not "broken": no
// alarm colour, no retry instruction, and crucially no editable controls that
// would silently fail to save. This is the UI-only softening that replaces the
// old page-wide "Some sections couldn't load" error banner.
function NotConfigured({ subject }: { subject: string }) {
  return (
    <Empty
      title="Not set up yet"
      description={`${subject} isn't configured in this environment yet. It will appear here once it's ready.`}
    />
  );
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

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
