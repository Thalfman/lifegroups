import { SectionHeader } from "@/components/layout/shell";
import { MetricDefaultsForm } from "@/components/admin/forms/metric-defaults-form";
import { GroupMetricOverridesForm } from "@/components/admin/forms/group-metric-overrides-form";
import { ClearGroupMetricOverridesButton } from "@/components/admin/forms/clear-group-metric-overrides-button";
import { ResetMetricDefaultsButton } from "@/components/admin/forms/reset-metric-defaults-button";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay } from "@/lib/pastoral";
import { hasActiveOverrides } from "@/lib/admin/metrics";
import type { MetricDefaults } from "@/lib/admin/metrics";
import type { GroupMetricSettingsRow, GroupsRow } from "@/types/database";

export type SettingsShellData = {
  defaults: MetricDefaults;
  defaultsSource: "live" | "fallback";
  groups: GroupsRow[];
  groupMetricSettings: GroupMetricSettingsRow[];
  errors: {
    defaults: string | null;
    groups: string | null;
    overrides: string | null;
  };
};

export function SettingsShell({ data }: { data: SettingsShellData }) {
  const settingsByGroupId = new Map(
    data.groupMetricSettings.map((s) => [s.group_id, s]),
  );
  const groupsById = new Map(data.groups.map((g) => [g.id, g]));

  const overrideRows = data.groupMetricSettings
    .filter((s) => hasActiveOverrides(s))
    .map((s) => ({ settings: s, group: groupsById.get(s.group_id) ?? null }))
    .filter((row) => row.group !== null)
    .sort((a, b) =>
      (a.group?.name ?? "").localeCompare(b.group?.name ?? ""),
    );

  const anyError =
    data.errors.defaults || data.errors.groups || data.errors.overrides;

  return (
    <div style={{ display: "grid", gap: 36 }}>
      {anyError ? (
        <div role="alert" style={alertStyle}>
          Some sections couldn&rsquo;t load. The page below shows what we did
          get; retry in a moment or check the Supabase connection.
        </div>
      ) : null}

      {data.defaultsSource === "fallback" ? (
        <div style={infoStyle}>
          Showing built-in defaults — the live <code>metric_defaults</code> row
          either wasn&rsquo;t loaded or hasn&rsquo;t been seeded yet. Saving
          will create or repair it.
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Global metric defaults"
          title="The thresholds that flag warnings"
          description="Set the ministry-wide defaults the dashboard uses for capacity, check-in cadence, and attendance health. Per-group overrides below take precedence when needed."
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
              ) : null,
            )}
          </ul>
        )}
      </section>
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
  const chips: { key: string; label: string; tone?: "neutral" | "watch" | "followup" }[] = [];
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
  if (settings.check_in_due_offset_hours_override != null)
    chips.push({
      key: "due",
      label: `Check-in due ${settings.check_in_due_offset_hours_override}h after meeting`,
    });
  if (settings.manual_health_status_override) {
    chips.push({
      key: "health",
      label: `Health: ${settings.manual_health_status_override.replace(/_/g, " ")}`,
      tone: "watch",
    });
  }
  if (settings.exclude_from_capacity_metrics)
    chips.push({ key: "ex", label: "Excluded from capacity", tone: "followup" });
  if (settings.admin_metric_notes && settings.admin_metric_notes.trim().length > 0)
    chips.push({ key: "note", label: "Has notes" });

  return (
    <article
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
        <div style={{ fontFamily: fontDisplay, fontSize: 16, color: P.ink, fontWeight: 500 }}>
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
        {settings.admin_metric_notes && settings.admin_metric_notes.trim().length > 0 ? (
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
      <ClearGroupMetricOverridesButton groupId={group.id} groupName={group.name} />
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
