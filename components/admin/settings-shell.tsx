import { AddToHomeScreenButton } from "@/components/pwa/add-to-home-screen-button";
import { ClearGroupMetricOverridesButton } from "@/components/admin/forms/clear-group-metric-overrides-button";
import { ResetMetricDefaultsButton } from "@/components/admin/forms/reset-metric-defaults-button";
import {
  SettingsTabs,
  type SettingsTab,
} from "@/components/admin/settings-tabs";
import { PBadge } from "@/components/pastoral/atoms";
import { SetupReturnBanner } from "@/components/lg/admin/setup-return-banner";
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
  GroupsCatalogEditor,
  MultiplyTriggerEditor,
  MetricDefaultsForm,
  GroupMetricOverridesForm,
  PeopleImportForm,
} from "@/components/admin/settings/lazy-editors";
import type { ReadinessCellSeed } from "@/components/admin/settings/multiply-trigger-editor";
import type { CellCoverage } from "@/lib/admin/cell-coverage";
import type {
  PerTypeReadinessRule,
  ReadinessRule,
} from "@/lib/admin/cell-readiness";
import type { CategoriesByAudience } from "@/components/admin/forms/group-category-options";
import type { GroupAudienceCategory } from "@/types/enums";

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
  // #412 Settings > Groups: the live category catalog (id + label). Feeds the
  // create flow's shared-label dedupe — the same label under a second Audience
  // reuses one category. Empty for a fresh ministry or when the read failed (see
  // errors.groupCategories).
  groupCategories: { id: string; label: string }[];
  // Settings > Groups: the category-picker options per top type, feeding the
  // inline edit drawer the group-type list now opens for an individual group.
  // Empty for a fresh ministry or when the per-type catalog reads failed.
  categoriesByAudience: CategoriesByAudience;
  // #400 / #412 Settings > Groups: per-active-cell coverage ("have X of Y"). Each
  // entry is a row in the group-type list, carrying its label, target, and live
  // count. Empty when no cell is active or the reads failed (see
  // errors.groupCategories).
  cellCoverage: CellCoverage[];
  // #402 / #410 / #411 / ADR 0021: the three-tier multiplication trigger the
  // Multiply sub-tab edits — the GLOBAL rule (each pillar in its natural unit), the
  // per-type (Audience) rules (the middle tier), and one row per active cell (its
  // per-cell overrides). Optional so the shell tolerates a build that hasn't wired
  // these reads yet; softens to a placeholder on errors.readiness.
  readiness?: {
    ministryYear: number;
    rule: ReadinessRule;
    // #473: true when a STORED global rule was present but couldn't be read, so
    // `rule` is the built-in fallback. The editor warns that saving overwrites
    // the stored trigger. A MISSING stored rule is not a fallback (no warning).
    ruleFellBack: boolean;
    perType: Partial<Record<GroupAudienceCategory, PerTypeReadinessRule>>;
    cells: ReadinessCellSeed[];
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
    // #396: a single transient-read failure key for the Groups tab's catalog +
    // cell reads, so an unmigrated environment softens to a placeholder.
    groupCategories: string | null;
    // #402: a readiness-rule read failure key, so the readiness editor softens to
    // a placeholder rather than saving over a rule that merely failed to load.
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
  cells: CellCoverage[];
  categories: { id: string; label: string }[];
  categoryIdsWithGroups: ReadonlySet<string>;
  groups: GroupsRow[];
  categoriesByAudience: CategoriesByAudience;
  groupReferencesKnown: boolean;
  error: string | null;
};

export type SettingsMultiplyModel = {
  readiness: SettingsShellData["readiness"];
  readinessError: string | null;
  groupCategoriesError: string | null;
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
  const categoryIdsWithGroups = new Set(
    data.groups
      .map((g) => g.category_id)
      .filter((id): id is string => id !== null)
  );

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
      cells: data.cellCoverage,
      categories: data.groupCategories,
      categoryIdsWithGroups,
      groups: data.groups,
      categoriesByAudience: data.categoriesByAudience,
      groupReferencesKnown: data.errors.groups === null,
      error: data.errors.groupCategories,
    },
    multiply: {
      readiness: data.readiness,
      readinessError: data.errors.readiness,
      groupCategoriesError: data.errors.groupCategories,
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
          eyebrow="Leader Health Rubric"
          title="How a leader is graded"
          description="Distinct from a leader's Care Status."
        />
        {model.errors.leaderRubric ? (
          <CouldNotLoad subject="The Leader Health Rubric" />
        ) : (
          <Card>
            <HealthRubricEditor
              criteria={model.leaderRubricCriteria}
              kind="leader"
              subjectLabel="leader"
            />
          </Card>
        )}
      </section>
    </div>
  );
}

// Groups tab (#412 / ADR 0021): where the admin creates the group types. Reworked
// from the old category×type matrix into a LIST of group types (cells) with a "+"
// create flow — pick an Audience, type a free-text category, save, and the
// (Audience × category) cell is created in one step. Each row carries its target,
// its coverage ("have X of Y"), a rename, and a remove. The trigger editor moved
// to the Multiply sub-tab (#411); this tab is just the types. Softens to a
// "couldn't load" notice when its reads fail (#469) — saved group types are
// intact, they just couldn't be read.
function GroupsPanel({ model }: { model: SettingsGroupsModel }) {
  return (
    <div className="grid gap-9">
      <section className="grid gap-4">
        <SettingsSectionHeader
          eyebrow="Group types"
          title="Group types (Audience + Category)"
          description="Each group type pairs an Audience with a Category. Add one with the + button, set its tracking target, then rename or remove it. Expand a type to see its groups (have X of Y counts active and launching) and edit one in place."
        />
        {model.error ? (
          <CouldNotLoad subject="Your group types" />
        ) : (
          <Card>
            <GroupsCatalogEditor
              cells={model.cells}
              categories={model.categories}
              categoryIdsWithGroups={model.categoryIdsWithGroups}
              groups={model.groups}
              categoriesByAudience={model.categoriesByAudience}
              // A failed groups read makes the reference set empty for the wrong
              // reason, so the editor must not offer deletion in that case.
              groupReferencesKnown={model.groupReferencesKnown}
            />
          </Card>
        )}
      </section>
    </div>
  );
}

// Multiply tab (#411 / ADR 0021): the multiplication trigger, configured through ONE
// tiered control over the three-tier cascade — Global default → per-type
// (Audience) → per-cell. A grouped radio/search picker chooses which level
// you're configuring; the four pillars then show, each either carrying its own
// value or inheriting its parent (labelled by source) behind an Override toggle.
// Interest is a count at every level
// (never a letter). Each level saves only itself via its matching audited RPC. The
// per-cell rows are built from the catalog + target reads, so a failure there
// (errors.groupCategories) softens this editor too — otherwise it would render with
// the global rule but its cell rows silently dropped. The Multiply grid
// (/admin/multiply) reads the resolved rule; here we own the editing.
function MultiplyPanel({ model }: { model: SettingsMultiplyModel }) {
  return (
    <div className="grid gap-9">
      <section className="grid gap-4">
        <SettingsSectionHeader
          eyebrow="Readiness rule"
          title="Ready in Multiply"
          description="Configure the readiness rule across the cascade: the ministry-wide default, an Audience rule, or a single group type. Each pillar inherits the level above unless you override it; set only what differs. Interest is the Interest Funnel people count; Watch thresholds stay in Thresholds; Capacity is a derived per-group-type issue; Group and Leader Health are A-F letters."
        />
        {/* #469: each failing read names itself — a failed trigger read and a
            failed group-types read (which feeds the per-cell rows) soften this
            editor with distinct copy, so this tab never blames the wrong read.
            Only a genuinely absent readiness shape (a build that hasn't wired
            these reads) is "not set up yet". */}
        {model.readinessError ? (
          <CouldNotLoad subject="The multiplication trigger" />
        ) : model.groupCategoriesError ? (
          <CouldNotLoad subject="The group types this trigger depends on" />
        ) : !model.readiness ? (
          <NotConfigured subject="The multiplication trigger" />
        ) : (
          <Card>
            <MultiplyTriggerEditor
              ministryYear={model.readiness.ministryYear}
              globalRule={model.readiness.rule}
              storedRuleFellBack={model.readiness.ruleFellBack}
              perType={model.readiness.perType}
              cells={model.readiness.cells}
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
