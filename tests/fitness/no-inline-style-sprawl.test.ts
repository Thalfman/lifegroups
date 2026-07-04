import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";
import { TEST_FILE_EXCLUDES } from "./support/scan";

// #847 finish line: one styling substrate. The pastoral surfaces used to carry
// two parallel systems — ~400 `style={{}}` sites plus a PButton wrapper beside
// the design-system Button. The migration converged everything onto Tailwind
// utilities + `components/ui`; these ratchets keep the sprawl from regrowing.
//
// The allowlist below is the full set of inline-style sites that CANNOT become
// utility classes, each for a stated mechanical reason. Adding a `style={{`
// anywhere else (or another site in an allowlisted file) fails this suite —
// if a new site is genuinely dynamic (a runtime-computed value), add it here
// with its reason in the same diff so the exception stays reviewable.

// file -> { count, reason }. Counts are exact, not maximums, so a REMOVED
// exception must also be reflected here (keeping the ledger truthful).
const INLINE_STYLE_ALLOWLIST: Record<
  string,
  { count: number; reason: string }
> = {
  // Replaces the root layout on a fatal error; the app's CSS may not load,
  // so its branding is deliberately inline.
  "app/global-error.tsx": { count: 6, reason: "renders without app CSS" },
  // Satori (ImageResponse) renders from inline styles only.
  "app/icons/render.tsx": { count: 1, reason: "Satori requires inline styles" },
  // CSS vars are invalid in SVG presentation attributes, so token-driven
  // fill/stroke go through `style`.
  "components/pastoral/atoms.tsx": {
    count: 8,
    reason: "SVG fill/stroke via CSS vars + caller-sized avatar box",
  },
  "components/lg/Icon.tsx": { count: 1, reason: "SVG stroke via CSS vars" },
  "components/pwa/install-guide-modal.tsx": {
    count: 1,
    reason: "SVG stroke via CSS vars",
  },
  // Caller-supplied numeric geometry (component APIs).
  "components/lg/Avatar.tsx": { count: 1, reason: "caller-sized box" },
  "components/lg/PageHeader.tsx": {
    count: 2,
    reason: "prop-driven maxWidth",
  },
  "components/lg/FrozenSurfaceBanner.tsx": {
    count: 1,
    reason: "prop-driven maxWidth",
  },
  "components/pastoral/shell.tsx": {
    count: 1,
    reason: "prop-driven maxWidth/padding escape hatch",
  },
  "components/admin/super-admin-only-badge.tsx": {
    count: 1,
    reason: "caller-sized box",
  },
  "components/admin/forms/confirm-action-button.tsx": {
    count: 1,
    reason: "caller-supplied gap",
  },
  // Data-driven values computed per render.
  "components/lg/admin/dashboard/overview-primitives.tsx": {
    count: 1,
    reason: "distribution-bar width %",
  },
  "components/admin/super-admin/usage-panel-shell.tsx": {
    count: 1,
    reason: "usage-bar width %",
  },
  // Shares one constant with the JS scroll logic (sticky anchor offset).
  "components/admin/super-admin/diagnostics-workspace.tsx": {
    count: 1,
    reason: "scroll-margin from the shared sticky-anchor constant",
  },
};

function appSourceFiles() {
  return readSourceFiles({
    roots: ["app", "components", "lib"],
    extensions: [".ts", ".tsx"],
    exclude: [...TEST_FILE_EXCLUDES],
  });
}

describe("fitness: no inline-style sprawl (#847)", () => {
  it("style={{ appears only at the allowlisted dynamic sites", () => {
    const failures: string[] = [];
    const seen = new Map<string, number>();
    for (const file of appSourceFiles()) {
      const count = (file.text.match(/style=\{\{/g) ?? []).length;
      if (count > 0) seen.set(file.relPath, count);
    }
    for (const [relPath, count] of seen) {
      const allowed = INLINE_STYLE_ALLOWLIST[relPath];
      if (!allowed) {
        failures.push(
          `${relPath}: ${count} style={{ site(s) — convert to Tailwind ` +
            `utilities, or allowlist with a reason if genuinely dynamic`
        );
      } else if (count !== allowed.count) {
        failures.push(
          `${relPath}: expected ${allowed.count} style={{ site(s) ` +
            `(${allowed.reason}), found ${count} — update the ledger with ` +
            `the reason if this is deliberate`
        );
      }
    }
    for (const relPath of Object.keys(INLINE_STYLE_ALLOWLIST)) {
      if (!seen.has(relPath)) {
        failures.push(
          `${relPath}: allowlisted but has no style={{ sites — remove its ` +
            `ledger entry`
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("no hoisted CSSProperties style objects reintroduce the sprawl", () => {
    // The census above counts literal `style={{` sites; hoisted
    // `const x: CSSProperties = {...}` objects were the migration's blind spot.
    // Component code has no remaining business declaring CSSProperties values —
    // prop TYPES (`style?: CSSProperties` passthroughs) don't match this scan.
    const failures: string[] = [];
    for (const file of appSourceFiles()) {
      const hits = file.text.match(
        /(?:const|let)\s+\w+\s*:\s*CSSProperties\s*=/g
      );
      if (hits) {
        failures.push(`${file.relPath}: ${hits.join(", ")}`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("the retired pastoral Button wrapper stays retired", () => {
    const failures: string[] = [];
    for (const file of appSourceFiles()) {
      if (file.relPath === "components/pastoral/button.tsx") {
        failures.push(
          "components/pastoral/button.tsx exists — PButton was retired by " +
            "#847; use components/ui/button"
        );
      }
      if (/from\s+"@\/components\/pastoral\/button"/.test(file.text)) {
        failures.push(`${file.relPath}: imports the retired pastoral button`);
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("the pastoral token aliases keep only their SVG/grain consumers", () => {
    // P.* / font* aliases duplicate the Tailwind theme; new consumers should
    // use utility classes. The remaining imports are the SVG call sites (CSS
    // vars are invalid in SVG presentation attributes) and the paperGrain
    // overlay object.
    const ALLOWED_PASTORAL_IMPORTERS = new Set([
      "components/pastoral/atoms.tsx",
      "components/pastoral/shell.tsx",
      "components/lg/PublicPageShell.tsx",
    ]);
    const failures: string[] = [];
    for (const file of appSourceFiles()) {
      if (file.relPath === "lib/pastoral.ts") continue;
      if (!/from\s+"@\/lib\/pastoral"/.test(file.text)) continue;
      if (!ALLOWED_PASTORAL_IMPORTERS.has(file.relPath)) {
        failures.push(
          `${file.relPath}: imports @/lib/pastoral — use Tailwind theme ` +
            `classes (or extend the allowlist for a new SVG/grain site)`
        );
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });
});
