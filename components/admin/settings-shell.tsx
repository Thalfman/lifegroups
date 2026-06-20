import { AddToHomeScreenButton } from "@/components/pwa/add-to-home-screen-button";
import { ClearGroupMetricOverridesButton } from "@/components/admin/forms/clear-group-metric-overrides-button";
import { ResetMetricDefaultsButton } from "@/components/admin/forms/reset-metric-defaults-button";
import {
  SettingsTabs,
  type SettingsTab,
} from "@/components/admin/settings-tabs";
import { PBadge } from "@/components/pastoral/atoms";
import { SetupReturnBanner } from "@/components/lg/admin/setup-return-banner";
import { GroupsReturnBanner } from "@/components/admin/settings/groups-return-banner";
import {
  buildOverrideRows,
  overrideSummaryChips,
  type OverrideRow,
} from "@/lib/admin/group-metric-overrides";
import type { MetricDefaults } from "@/lib/admin/metrics";
import type { GroupMetricSettingsRow, GroupsRow } from "@/types/database";
import type { RubricCriterion } from "@/lib/admin/health-rubric";
// The per-tab editors/forms are loaded lazily (ssr:false) so their code lands in
// per-tab chunks fetched on first open, not in this route's First Load JS (the
// Tabs primitive mounts only the active panel). See settings/lazy-editors.
import {
  HealthRubricEditor,
  GroupTypesEditor,
  MultiplyTriggerEditor,
  MetricDefaultsForm,
  GroupMetricOverridesForm,
  PeopleImportForm,
} from "@/components/admin/settings/lazy-editors";
import type { ReadinessRule } from "@/lib/admin/cell-readiness";

export type SettingsShellData = {
  defaults: MetricDefaults;
  defaultsSource: "live" | "fallback";
  groups: GroupsRow[];
  groupMetricSettings: GroupMetricSettingsRow[];
  // #374 / ADR 0018: the criteria the group Health Rubric editor seeds with
  // (Julian-owned). When a rubric has been saved this is its stored criteria;
  // when none exists yet it's the working in-code default
  // (DEFAULT_GROUP_RUBRIC_CRITERIA, 40/40/20) so the editor never shows a
  // zeroed 0/100 form (#642). hasSavedGroupRubric distinguishes the two.
  groupRubricCriteria: RubricCriterion[];
  // #642: false when no health_rubrics row exists yet, so the editor shows the
  // "starting defaults" note and the first save is what persists the rubric.
  hasSavedGroupRubric: boolean;
  // #378 / ADR 0018: the current Leader-Health Rubric's criteria — the symmetric
  // per-leader rubric, same editor parameterized to the "leader" kind. Empty
  // until Julian builds it.
  leaderRubricCriteria: RubricCriterion[];
  // Settings > Groups: the admin-managed free-text group-type list (one name per
  // line in the editor). Empty for a fresh ministry or when the read failed (see
  // errors.groupTypes).
  groupTypes: string[];
  // The single GLOBAL multiplication readiness rule the Multiply sub-tab edits
  // (each pillar in its natural unit). Optional so the shell tolerates a build
  // that hasn't wired this read yet; softens to a placeholder on errors.readiness.
  readiness?: {
    ministryYear: number;
    rule: ReadinessRule;
    // True when a STORED global rule was present but couldn't be read, so `rule`
    // is the built-in fallback. The editor warns that saving overwrites the
    // stored trigger. A MISSING stored rule is not a fallback (no warning).
    ruleFellBack: boolean;
  };
  // Issue #304: whether the viewer is the super_admin. Settings is a
  // ministry-admin surface. Bulk people import is now an ordinary admin
  // capability rendered in the System tab for every admin (the importer posts to
  // the admin-gated admin_bulk_import_people RPC), so this flag no longer gates
  // the importer; it is retained for any future super-admin-only settings.
  isSuperAdmin: boolean;
  errors: {
    defaults: string | null;
    groups: string | null;
    overrides: string | null;
    // #378 / #374: a transient read failure for either health rubric must surface
    // (not silently fall back to a blank rubric), so an admin save can't overwrite
    // a rubric that merely failed to load. A failed section renders a calm
    // "couldn't load" notice in place of its editor (#469) — never the "not set
    // up yet" copy, which would read as data loss — rather than tripping a
    // page-wide error banner.
    groupRubric: string | null;
    leaderRubric: string | null;
    // A transient-read failure key for the Groups tab's group-type list, so an
    // unmigrated environment softens to a placeholder.
    groupTypes: string | null;
    // A readiness-rule read failure key, so the readiness editor softens to a
    // placeholder rather than saving over a rule that merely failed to load.
    readiness: string | null;
  };
};

export type SettingsCareModel = {
  groupRubricCriteria: RubricCriterion[];
  hasSavedGroupRubric: boolean;
  leaderRubricCriteria: RubricCriterion[];
  errors: Pick<SettingsShellData["errors"], "groupRubric" | "leaderRubric">;
};

export type SettingsGroupsModel = {
  groupTypes: string[];
  error: string | null;
};

export type SettingsMultiplyModel = {
  readiness: SettingsShellData["readiness"];
  readinessError: string | null;
};

export type SettingsThresholdsModel = {
  defaults: MetricDefaults;
  groups: GroupsRow[];
  settingsByGroupId: Map<string, GroupMetricSettingsRow>;
  overrideRows: OverrideRow[];
};

export type SettingsWorkspaceModel = {
  defaultsSource: SettingsShellData["defaultsSource"];
  care: SettingsCareModel;
  groups: SettingsGroupsModel;
  multiply: SettingsMultiplyModel;
  thresholds: SettingsThresholdsModel;
  system: { isSuperAdmin: boolean };
};

export function buildSettingsWorkspace(
  data: SettingsShellData
): SettingsWorkspaceModel {
  const settingsByGroupId = new Map(
    data.groupMetricSettings.map((s) => [s.group_id, s])
  );
  const overrideRows = buildOverrideRows(data.groups, data.groupMetricSettings);

  return {
    defaultsSource: data.defaultsSource,
    care: {
      groupRubricCriteria: data.groupRubricCriteria,
      hasSavedGroupRubric: data.hasSavedGroupRubric,
      leaderRubricCriteria: data.leaderRubricCriteria,
      errors: {
        groupRubric: data.errors.groupRubric,
        leaderRubric: data.errors.leaderRubric,
      },
    },
    groups: {
      groupTypes: data.groupTypes,
      error: data.errors.groupTypes,
    },
    multiply: {
      readiness: data.readiness,
      readinessError: data.errors.readiness,
    },
    thresholds: {
      defaults: data.defaults,
      groups: data.groups,
      settingsByGroupId,
      overrideRows,
    },
    system: { isSuperAdmin: data.isSuperAdmin },
  };
}

export function SettingsShell({
  data,
  // Optional deep-link target (from `?tab=`). SettingsTabs falls back to the
  // default when it's undefined or not a known tab id.
  initialTabId,
}: {
  data: SettingsShellData;
  initialTabId?: string;
}) {
  const workspace = buildSettingsWorkspace(data);

  // Settings is organized around the Care/Plan/Multiply spine (ADR 0016): Care
  // owns the rubrics that grade leaders/groups, Multiply owns the per-type
  // pillar config, and the older dashboard-warning number knobs are demoted to
  // their own Thresholds tab. Plan carries no configuration today, so it has no
  // tab.
  const tabs: SettingsTab[] = [
    {
      id: "care",
      label: "Care",
      panel: <CarePanel model={workspace.care} />,
    },
    {
      id: "groups",
      label: "Groups",
      panel: <GroupsPanel model={workspace.groups} />,
    },
    {
      id: "multiply",
      label: "Multiply",
      panel: <MultiplyPanel model={workspace.multiply} />,
    },
    {
      id: "thresholds",
      label: "Thresholds",
      panel: <ThresholdsPanel model={workspace.thresholds} />,
    },
    {
      id: "system",
      label: "System",
      panel: <SystemPanel />,
    },
  ];

  return (
    <div className="grid gap-7">
      {workspace.defaultsSource === "fallback" ? (
        <div className="rounded-sm border border-line bg-bg px-3.5 py-3 font-sans text-xs italic text-ink3">
          Showing built-in defaults — the live <code>metric_defaults</code> row
          either wasn&rsquo;t loaded or hasn&rsquo;t been seeded yet. Saving
          will create or repair it.
        </div>
      ) : null}

      {/* Care is the default tab: it carries the rubrics that define how leaders
          and groups are graded — the heart of what Settings configures now (ADR
          0016). A section whose read failed softens to a calm "couldn't load"
          notice (#469) rather than tripping a page-wide error. */}
      <SettingsTabs tabs={tabs} defaultTabId={initialTabId ?? "care"} />
    </div>
  );
}

// One plain serif heading per section (design direction §2: the serif speaks
// once) — no ornament divider, no tracked-uppercase eyebrow. The eyebrow text
// survives as a quiet sans context line above the heading.
function SettingsSectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="grid gap-1">
      {eyebrow ? (
        <div className="font-sans text-sm text-ink3">{eyebrow}</div>
      ) : null}
      <h2 className="m-0 font-display text-xl font-medium text-ink">{title}</h2>
      {description ? (
        <p className="m-0 max-w-[720px] font-sans text-base text-ink2">
          {description}
        </p>
      ) : null}
    </div>
  );
}

// Care tab: the rubrics that define how leaders and groups are graded — the
// configuration at the heart of Care (ADR 0016). The two A–F Health Rubrics
// (group + leader; #374/#378, ADR 0018) live here. A rubric whose read failed
// softens to a calm "couldn't load" notice (#469) instead of an editor whose
// empty seed could overwrite a saved rubric the admin can't see. Each section's
// instruction copy lives once, inside the editor card — the old outer lede
// repeated it nearly verbatim (design direction §4).
function CarePanel({ model }: { model: SettingsCareModel }) {
  return (
    <div className="grid gap-9">
      {/* #374 / ADR 0018: the Group Health Rubric — Julian's weighted criteria
          that roll up to an A–F grade. Owned here in Settings (Ministry-Admin),
          not the Super Admin Console. Save is gated on the weights totalling
          100, enforced both in the editor and the audited RPC. */}
      <section className="grid gap-4">
        <SettingsSectionHeader
          eyebrow="Group Health Rubric"
          title="How a group is graded"
        />
        {model.errors.groupRubric ? (
          <CouldNotLoad subject="The Group Health Rubric" />
        ) : (
          <Card>
            <HealthRubricEditor
              criteria={model.groupRubricCriteria}
              hasSavedRubric={model.hasSavedGroupRubric}
            />
          </Card>
        )}
      </section>

      {/* #378 / ADR 0018 (pivot slice 5): the Leader-Health Rubric — the
          symmetric per-leader weighted criteria that roll up to an A–F
          Leader-Health Grade entered in Care. Same editor, parameterized to the
          "leader" kind; same weight-to-100 gate. A deliberate FOURTH "health"
          concept, distinct from Leader Care Status and the Health Pulse. */}
      <section className="grid gap-4">
        <SettingsSectionHeader
          eyebrow="Shepherd Health Rubric"
          title="How a shepherd is graded"
          description="Distinct from a shepherd's Care Status."
        />
        {model.errors.leaderRubric ? (
          <CouldNotLoad subject="The Shepherd Health Rubric" />
        ) : (
          <Card>
            <HealthRubricEditor
              criteria={model.leaderRubricCriteria}
              kind="leader"
              subjectLabel="shepherd"
            />
          </Card>
        )}
      </section>
    </div>
  );
}

// Groups tab: the admin-managed free-text group-type list. A single text box
// (one type name per line); a group's type is then chosen from this list (or
// left Untyped). Per-type coverage + config lives in Multiply. Softens to a
// "couldn't load" notice when the read fails (#469) — saved types are intact.
function GroupsPanel({ model }: { model: SettingsGroupsModel }) {
  return (
    <div className="grid gap-9">
      {/* Self-gating: only shows when arriving from the Plan form's "+ Add a
          group type" shortcut (?from=plan), offering the path back to the funnel. */}
      <GroupsReturnBanner />
      <section className="grid gap-4">
        <SettingsSectionHeader
          eyebrow="Group types"
          title="Group types"
          description="The free-text type names a group can be tagged with. Enter one per line. A group picks its type from this list, or stays Untyped. Per-type targets and readiness live in Multiply."
        />
        {model.error ? (
          <CouldNotLoad subject="Your group types" />
        ) : (
          <Card>
            <GroupTypesEditor groupTypes={model.groupTypes} />
          </Card>
        )}
      </section>
    </div>
  );
}

// Multiply tab: the single GLOBAL multiplication readiness rule. Each pillar
// carries a value in its natural unit. A group type can override this rule from
// the Multiply surface's per-type config; with no override it inherits this
// rule. Softens to a "couldn't load" notice on a failed read (#469) so an admin
// save can't overwrite a rule that merely failed to load.
function MultiplyPanel({ model }: { model: SettingsMultiplyModel }) {
  return (
    <div className="grid gap-9">
      <section className="grid gap-4">
        <SettingsSectionHeader
          eyebrow="Readiness rule"
          title="Ready in Multiply"
          description="The ministry-wide readiness rule. Each pillar carries a value in its natural unit; a group type can override any pillar from Multiply. Interest is the Interest Funnel people count; Watch thresholds stay in Thresholds; Group and Shepherd Health are A-F letters."
        />
        {model.readinessError ? (
          <CouldNotLoad subject="The multiplication trigger" />
        ) : !model.readiness ? (
          <NotConfigured subject="The multiplication trigger" />
        ) : (
          <Card>
            <MultiplyTriggerEditor
              ministryYear={model.readiness.ministryYear}
              globalRule={model.readiness.rule}
              storedRuleFellBack={model.readiness.ruleFellBack}
            />
          </Card>
        )}
      </section>
    </div>
  );
}

// Thresholds tab: the dashboard-warning number knobs, grouped by their LIVE
// consumer (#478): the Care cadence pair and the three group-health thresholds
// (incl. the healthy-attendance cut line the rubric read overlays) drive Care
// and Home today; the capacity set only drives the
// (flagged-off) hidden surfaces. They all live in the single MetricDefaultsForm
// (live-driving fields always visible; the hidden-surface-only set behind the
// "Drives hidden surfaces" disclosure). The rarely-used per-group overrides
// stay demoted into their own collapsed disclosure below.
function ThresholdsPanel({ model }: { model: SettingsThresholdsModel }) {
  return (
    <div className="grid gap-9">
      <section className="grid gap-4">
        <SettingsSectionHeader
          eyebrow="Global metric defaults"
          title="The thresholds that flag warnings"
          description="Ministry-wide defaults, grouped by what each one drives. The Care cadence and Watch threshold drive Care and Home today; the capacity set only drives hidden surfaces."
        />
        <Card>
          <MetricDefaultsForm defaults={model.defaults} />
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t border-line pt-3.5">
            <div className="m-0 max-w-[380px] font-sans text-sm text-ink2">
              <strong className="font-semibold text-ink">
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
      <details className="rounded-lg border border-line bg-surface px-5 py-4">
        <summary className="flex cursor-pointer flex-wrap items-baseline gap-2.5 font-display text-lg font-medium text-ink">
          Per-group overrides
          <span className="font-sans text-xs font-normal text-ink3">
            {model.overrideRows.length === 0
              ? "none active"
              : `${model.overrideRows.length} active`}
          </span>
        </summary>

        <div className="mt-6 grid gap-9">
          <section className="grid gap-4">
            <SettingsSectionHeader
              eyebrow="Group-specific overrides"
              title="Per-group adjustments"
              description="Override thresholds or health labels for a single group."
            />
            <Card>
              <GroupMetricOverridesForm
                groups={model.groups}
                settingsByGroupId={model.settingsByGroupId}
              />
            </Card>
          </section>

          <section className="grid gap-3.5">
            <SettingsSectionHeader
              eyebrow="Currently overridden"
              title="Groups with active overrides"
              description="Clear an override to fall back to the global defaults."
            />
            {model.overrideRows.length === 0 ? (
              <Empty
                title="No active overrides"
                description="Every group is following the global defaults above."
              />
            ) : (
              <ul className="m-0 grid list-none gap-3 p-0">
                {model.overrideRows.map(({ group, settings }) => (
                  <li key={settings.group_id}>
                    <OverrideSummaryRow group={group} settings={settings} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}

// System tab: utility pointers that aren't part of Care/Plan/Multiply config.
// Bulk people import is now an ordinary admin capability (Ministry Admin + Super
// Admin) hosted here — the importer form posts to the admin-gated
// admin_bulk_import_people RPC (auth_is_admin() + paired audit row), so no
// Super-Admin-console hop is needed. The same form is reused in the Super Admin
// Console. Future reminder/email preferences will also land here.
function SystemPanel() {
  return (
    <div className="grid gap-4">
      <SettingsSectionHeader
        eyebrow="Imports"
        title="Adding people"
        description="How people get into the system."
      />
      {/* Anchor + return banner mirror the Super-Admin console panel: the setup
          checklist's "Import people" step deep-links here (?tab=system
          #people-import) and the banner (self-gating on ?from=setup) offers a
          "← Back to setup" path. */}
      <section id="people-import" className="grid gap-3.5">
        <SetupReturnBanner />
        <Card>
          <p className="m-0 mb-3.5 font-sans text-sm text-ink2">
            Add people one at a time from the People page, or bulk-import a
            whole roster from a spreadsheet here. Upload a CSV file or paste
            rows; parsing and de-duplication run before any write, and skipped
            rows are reported back. Each import is one audited batch.
          </p>
          <PeopleImportForm />
        </Card>
      </section>

      {/* #648: the "Add to Home Screen" affordance lives here in Settings now,
          not in the admin Home header. The button renders nothing when the app
          is already installed or install isn't supported, so the card keeps a
          line of explanatory copy and is never empty. */}
      <SettingsSectionHeader eyebrow="App" title="Install app" />
      <Card>
        <p className="m-0 mb-3.5 font-sans text-sm text-ink2">
          Add this app to your device&rsquo;s Home Screen so it opens
          full-screen. If it&rsquo;s already installed or your browser
          doesn&rsquo;t support it, there&rsquo;s nothing to do here.
        </p>
        <AddToHomeScreenButton />
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
  // #478 (P2.2): the chips echo the CANONICAL health-status label (the same
  // map the override form's dropdown offers), never de-underscored enum text —
  // pinned in lib/admin/group-metric-overrides.
  const chips = overrideSummaryChips(settings);

  return (
    <article className="grid grid-cols-1 items-start gap-3 rounded-md border border-line bg-surface px-[18px] py-3.5 md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="font-display text-lg font-medium text-ink">
          {group.name}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <PBadge key={c.key} tone={c.tone ?? "neutral"}>
              {c.label}
            </PBadge>
          ))}
        </div>
        {settings.admin_metric_notes &&
        settings.admin_metric_notes.trim().length > 0 ? (
          <p className="m-0 mt-2.5 font-sans text-sm text-ink2">
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
    <div className="rounded-lg border border-line bg-surface p-card">
      {children}
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-[22px] text-center">
      <div className="mb-1.5 font-display text-lg font-medium text-ink">
        {title}
      </div>
      <p className="m-0 font-sans text-sm text-ink2">{description}</p>
    </div>
  );
}

// A calm placeholder for a configuration section whose data genuinely isn't
// there yet — no read error, the shape simply hasn't been wired in this build.
// It reads as "coming soon," not "broken". A FAILED read never lands here
// (#469): it renders CouldNotLoad below instead, so an operator with a saved
// configuration never mistakes a transient failure for data loss.
function NotConfigured({ subject }: { subject: string }) {
  return (
    <Empty
      title="Not set up yet"
      description={`${subject} isn't configured in this environment yet. It will appear here once it's ready.`}
    />
  );
}

// #469: the read-ERROR half of the old "not configured" placeholder. The saved
// configuration still exists — it just couldn't be read — so the copy names the
// failing section and reassures, and crucially no editor renders: a save over a
// failed read could overwrite configuration the admin can't see.
function CouldNotLoad({ subject }: { subject: string }) {
  return (
    <Empty
      title="Couldn't load"
      description={`${subject} couldn't be loaded right now. Your saved configuration is unchanged — refresh to try again.`}
    />
  );
}
