import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// #469: a failed Settings read must render the calm "couldn't load" notice —
// never the "not set up yet" placeholder, which an operator with a saved
// Health Rubric reads as data loss — and must render NO editor over it (a save
// over a failed read could overwrite configuration the admin can't see).
// Genuinely empty-but-healthy data keeps the existing empty-seed editor. Each
// section names its own failing read, so a single failed group-types read no
// longer blanks the Groups and Multiply tabs with identical copy.

// The shell's editors bind "use server" actions; stub both action modules so
// static rendering never pulls server-only deps (the markup never invokes
// them). Same approach as prospect-create-form.test.tsx.
vi.mock("@/app/(protected)/admin/settings/actions", () => ({
  adminUpdateMetricDefaults: vi.fn(),
  adminUpsertGroupMetricSettings: vi.fn(),
  adminResetMetricDefaults: vi.fn(),
  adminSetHealthRubric: vi.fn(),
  adminSetMultiplicationConfig: vi.fn(),
  adminCreateGroupCategory: vi.fn(),
  adminRenameGroupCategory: vi.fn(),
  adminArchiveGroupCategory: vi.fn(),
  adminSetCategoryTypeCell: vi.fn(),
  adminSetCategoryTypeTargetCount: vi.fn(),
  adminSetGroupCategory: vi.fn(),
  adminSetReadinessRule: vi.fn(),
  adminSetAudienceReadinessRule: vi.fn(),
  adminSetCellTriggerOverrides: vi.fn(),
}));
vi.mock("@/app/(protected)/admin/groups/actions", () => ({
  adminCreateGroup: vi.fn(),
  adminUpdateGroup: vi.fn(),
  adminCloseGroup: vi.fn(),
  adminReopenGroup: vi.fn(),
}));
// The Groups catalog editor's drawer hook calls useRouter(); there is no app
// router mounted in a static render, so stub the hook.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import {
  SettingsShell,
  type SettingsShellData,
} from "@/components/admin/settings-shell";
import { BUILT_IN_METRIC_DEFAULTS } from "@/lib/admin/metrics";
import { BUILT_IN_READINESS_RULE } from "@/lib/admin/cell-readiness";
import { EMPTY_CATEGORIES_BY_AUDIENCE } from "@/components/admin/forms/group-category-options";

const NO_ERRORS: SettingsShellData["errors"] = {
  defaults: null,
  groups: null,
  overrides: null,
  groupRubric: null,
  leaderRubric: null,
  groupCategories: null,
  readiness: null,
};

// A healthy, genuinely-EMPTY Settings payload (fresh ministry): every read
// succeeded and returned nothing, so every section must open its editor with
// an empty seed.
function shellData(
  overrides: Partial<SettingsShellData> = {}
): SettingsShellData {
  return {
    defaults: BUILT_IN_METRIC_DEFAULTS,
    defaultsSource: "live",
    groups: [],
    groupMetricSettings: [],
    groupRubricCriteria: [],
    leaderRubricCriteria: [],
    groupCategories: [],
    categoriesByAudience: EMPTY_CATEGORIES_BY_AUDIENCE,
    cellCoverage: [],
    readiness: {
      ministryYear: 2026,
      rule: BUILT_IN_READINESS_RULE,
      ruleFellBack: false,
      perType: {},
      cells: [],
    },
    isSuperAdmin: false,
    errors: NO_ERRORS,
    ...overrides,
  };
}

function withErrors(
  errors: Partial<SettingsShellData["errors"]>
): SettingsShellData {
  return shellData({ errors: { ...NO_ERRORS, ...errors } });
}

// renderToStaticMarkup escapes apostrophes (&#x27;) and quotes, so decode the
// handful React emits before matching human copy like "couldn't be loaded".
function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function render(data: SettingsShellData, tab: string): string {
  return decode(
    renderToStaticMarkup(<SettingsShell data={data} initialTabId={tab} />)
  );
}

function count(html: string, marker: string): number {
  return html.split(marker).length - 1;
}

// Stable copy + editor markers. The notice copy is the load-bearing contract
// (#469): reassures that saved configuration is unchanged.
const COULD_NOT_LOAD =
  "couldn't be loaded right now. Your saved configuration is unchanged — refresh to try again.";
const NOT_CONFIGURED = "isn't configured in this environment yet";
const RUBRIC_EDITOR = "Save rubric"; // HealthRubricEditor submit
const GROUPS_EDITOR = "+ Add a group type"; // GroupsCatalogEditor create flow
const MULTIPLY_EDITOR = "multiply-trigger-level"; // MultiplyTriggerEditor scope picker

describe("SettingsShell Care tab — rubric read errors (#469)", () => {
  it("renders the couldn't-load notice (never 'not configured') and no editor when the group rubric read fails", () => {
    const html = render(withErrors({ groupRubric: "boom" }), "care");

    expect(html).toContain(`The Group Health Rubric ${COULD_NOT_LOAD}`);
    expect(html).not.toContain(NOT_CONFIGURED);
    // Only the healthy Leader rubric still offers its editor — no editor may
    // render over the failed group-rubric read.
    expect(count(html, RUBRIC_EDITOR)).toBe(1);
  });

  it("names the leader rubric's own failing read and keeps the group editor", () => {
    const html = render(withErrors({ leaderRubric: "boom" }), "care");

    expect(html).toContain(`The Leader Health Rubric ${COULD_NOT_LOAD}`);
    expect(html).not.toContain(`The Group Health Rubric ${COULD_NOT_LOAD}`);
    expect(html).not.toContain(NOT_CONFIGURED);
    expect(count(html, RUBRIC_EDITOR)).toBe(1);
  });

  it("opens both empty-seed editors when the reads succeeded with no rubrics", () => {
    const html = render(shellData(), "care");

    expect(count(html, RUBRIC_EDITOR)).toBe(2);
    expect(html).not.toContain(COULD_NOT_LOAD);
    expect(html).not.toContain(NOT_CONFIGURED);
  });
});

describe("SettingsShell Groups tab — group-types read error (#469)", () => {
  it("renders the couldn't-load notice and no editor when the group-types reads fail", () => {
    const html = render(withErrors({ groupCategories: "boom" }), "groups");

    expect(html).toContain(`Your group types ${COULD_NOT_LOAD}`);
    expect(html).not.toContain(NOT_CONFIGURED);
    expect(html).not.toContain(GROUPS_EDITOR);
  });

  it("opens the empty-seed editor when the reads succeeded with no group types", () => {
    const html = render(shellData(), "groups");

    expect(html).toContain(GROUPS_EDITOR);
    expect(html).not.toContain(COULD_NOT_LOAD);
    expect(html).not.toContain(NOT_CONFIGURED);
  });
});

describe("SettingsShell Multiply tab — trigger read errors (#469)", () => {
  it("renders the couldn't-load notice and no editor when the trigger read fails", () => {
    const html = render(withErrors({ readiness: "boom" }), "multiply");

    expect(html).toContain(`The multiplication trigger ${COULD_NOT_LOAD}`);
    expect(html).not.toContain(NOT_CONFIGURED);
    expect(html).not.toContain(MULTIPLY_EDITOR);
  });

  it("names the group-types read when only THAT read failed — not the trigger's", () => {
    // The per-cell rows are built from the group-types reads, so their failure
    // softens this editor too — but the notice must blame the actual failing
    // read, not claim the trigger itself couldn't be read.
    const html = render(withErrors({ groupCategories: "boom" }), "multiply");

    expect(html).toContain(
      `The group types this trigger depends on ${COULD_NOT_LOAD}`
    );
    expect(html).not.toContain(`The multiplication trigger ${COULD_NOT_LOAD}`);
    expect(html).not.toContain(NOT_CONFIGURED);
    expect(html).not.toContain(MULTIPLY_EDITOR);
  });

  it("opens the editor when the reads succeeded (built-in rule, no cells)", () => {
    const html = render(shellData(), "multiply");

    expect(html).toContain(MULTIPLY_EDITOR);
    expect(html).not.toContain(COULD_NOT_LOAD);
    expect(html).not.toContain(NOT_CONFIGURED);
  });

  it("keeps 'not set up yet' ONLY for a build with no readiness shape and no error", () => {
    const html = render(shellData({ readiness: undefined }), "multiply");

    expect(html).toContain(NOT_CONFIGURED);
    expect(html).not.toContain(COULD_NOT_LOAD);
    expect(html).not.toContain(MULTIPLY_EDITOR);
  });
});
