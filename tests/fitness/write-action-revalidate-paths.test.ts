import { describe, expect, it } from "vitest";

import { readSourceFiles, stripComments } from "./support/source-globber";
import { stripFiles, TEST_FILE_EXCLUDES } from "./support/scan";
import {
  extractRevalidateFingerprints,
  renderMapEntries,
} from "./support/revalidate-targets";
import { EXPECTED_REVALIDATE_PATHS } from "./support/revalidate-path-map";

// Revalidate sets are hand-maintained per write action; a missing path
// silently serves stale router-cache data on the surfaces that render the
// action's data (the class of bug fixed in #810). This check pins each
// action's DECLARED revalidate-path set against the maintained map in
// `support/revalidate-path-map.ts`, so any change to a revalidate set is a
// deliberate, reviewed diff — and a new write action cannot ship without an
// entry (issue #824).
//
// Scope and known limits (static analysis, same idiom as the other checks):
// - The fingerprint is the UNION over conditional branches — a path emitted
//   only on (say) archive still appears in the set; that is the right
//   question ("which paths MAY this action revalidate").
// - Runtime filtering inside helpers is invisible; resolution follows
//   same-file top-level declarations only (no imported path helpers exist
//   today — one appearing yields an empty fingerprint, which is a loud
//   extraction error, never a silent []). The exact literal `() => []`
//   declares "revalidates nothing" and pins [] deliberately.
// - Path revalidation only; cache tags (`updateTag`) are out of scope.

// Server actions live under app/ AND lib/ (e.g. lib/usage/actions.ts, the
// usage beacon). The `"use server"` pre-filter keeps non-action modules that
// merely match the filename convention (lib/admin/contextual-actions.ts) out
// of scope.
const ACTION_FILES = stripFiles(
  readSourceFiles({
    roots: ["app", "lib"],
    extensions: [".ts"],
    exclude: [...TEST_FILE_EXCLUDES],
  })
    .filter((f) => /(^|\/)(actions|[a-z-]+-actions)\.ts$/.test(f.relPath))
    .filter((f) => f.text.includes('"use server"')),
  stripComments
);

const { entries, errors } = extractRevalidateFingerprints(ACTION_FILES);

// Action modules that perform NO path revalidation by design. Everything else
// must contribute at least one spec fingerprint or a `#direct` entry, so a new
// hand-rolled module that revalidates nothing is a conscious, reviewed call.
const EXEMPT: Readonly<Record<string, string>> = {
  // Supabase Auth flows — no table writes, nothing rendered to refresh.
  "app/login/actions.ts": "Supabase Auth sign-in, no revalidation target",
  "app/forgot-password/actions.ts": "Supabase Auth password-recovery flow",
  "app/reset-password/actions.ts": "Supabase Auth updateUser flow",
  "app/(protected)/actions.ts": "logout (Supabase Auth signOut only)",
  // Self-service narrow RPC that redirects or re-renders via navigation.
  "app/(protected)/orientation-actions.ts":
    "orientation-seen flag read fresh per request",
  // Edge-Function invoker that ends in a redirect to a fresh session.
  "app/invite/[token]/actions.ts": "redeem-invite Edge Function + redirect",
  // Fire-and-forget usage telemetry — nothing rendered reads it live.
  "lib/usage/actions.ts":
    "usage-beacon log write (best-effort telemetry, no cached surface)",
};

describe("fitness: every write action's revalidate-path set is pinned", () => {
  it("found a representative set of modules and fingerprints", () => {
    // Guard against a glob/pairing regression silently scanning nothing.
    expect(ACTION_FILES.length).toBeGreaterThan(40);
    expect(Object.keys(entries).length).toBeGreaterThan(90);
  });

  it("extracted every declaration cleanly", () => {
    expect(
      errors,
      errors.length === 0
        ? ""
        : `The extractor could not derive a fingerprint for these ` +
            `declarations. Restructure to the prevailing spec shape, or ` +
            `extend support/revalidate-targets.ts:\n${errors
              .map((e) => `  ${e}`)
              .join("\n")}`
    ).toEqual([]);
  });

  it("every write action has an entry in the expected map", () => {
    const missing = Object.keys(entries).filter(
      (key) => !(key in EXPECTED_REVALIDATE_PATHS)
    );
    const paste =
      missing.length === 0
        ? ""
        : renderMapEntries(
            Object.fromEntries(missing.map((k) => [k, entries[k]]))
          );
    expect(
      missing,
      missing.length === 0
        ? ""
        : `These write actions have no entry in ` +
            `support/revalidate-path-map.ts. Review each declared set against ` +
            `the surfaces that render the action's data, then add:\n${paste}`
    ).toEqual([]);
  });

  it("no action's declared paths drifted from the expected map", () => {
    const drifted = Object.keys(entries)
      .filter((key) => key in EXPECTED_REVALIDATE_PATHS)
      .filter(
        (key) =>
          JSON.stringify(entries[key]) !==
          JSON.stringify([...EXPECTED_REVALIDATE_PATHS[key]].sort())
      );
    const report = drifted
      .map(
        (key) =>
          `  ${key}\n    declared: ${JSON.stringify(entries[key])}\n` +
          `    pinned:   ${JSON.stringify(
            EXPECTED_REVALIDATE_PATHS[key]
          )}\n    paste:\n  ${renderMapEntries({ [key]: entries[key] })}`
      )
      .join("\n");
    expect(
      drifted,
      drifted.length === 0
        ? ""
        : `These actions' declared revalidate paths no longer match the ` +
            `pinned map. If the change is intended, update the map:\n${report}`
    ).toEqual([]);
  });

  it("the expected map and EXEMPT ledger have no stale entries", () => {
    const staleMap = Object.keys(EXPECTED_REVALIDATE_PATHS).filter(
      (key) => !(key in entries)
    );
    const present = new Set(ACTION_FILES.map((f) => f.relPath));
    // A file revalidates when it has a `#direct` entry OR now declares runner
    // specs — either way its exemption is stale.
    const specFiles = new Set(
      ACTION_FILES.filter((f) =>
        /\bname:\s*["'][a-z0-9_]+(?:\.[a-z0-9_]+)+["']/.test(f.text)
      ).map((f) => f.relPath)
    );
    const staleExempt = Object.keys(EXEMPT).filter(
      (p) =>
        !present.has(p) ||
        specFiles.has(p) ||
        Object.keys(entries).some((k) => k === `file:${p}#direct`)
    );
    expect(
      [...staleMap, ...staleExempt],
      `Stale entries — map keys with no live declaration, or EXEMPT files ` +
        `that are gone or now revalidate:\n${[...staleMap, ...staleExempt]
          .map((s) => `  ${s}`)
          .join("\n")}`
    ).toEqual([]);
  });

  it("every action module contributes a fingerprint or is documented-exempt", () => {
    const covered = new Set<string>();
    for (const key of Object.keys(entries)) {
      const direct = /^file:(.+)#direct$/.exec(key);
      if (direct) covered.add(direct[1]);
    }
    // A module with at least one spec fingerprint is covered; attribute spec
    // keys back to files by re-checking which files contain a spec name.
    for (const f of ACTION_FILES) {
      if (/\bname:\s*["'][a-z0-9_]+(?:\.[a-z0-9_]+)+["']/.test(f.text)) {
        covered.add(f.relPath);
      }
    }
    const uncovered = ACTION_FILES.map((f) => f.relPath).filter(
      (p) => !covered.has(p) && !(p in EXEMPT)
    );
    expect(
      uncovered,
      uncovered.length === 0
        ? ""
        : `These action modules neither declare a revalidate fingerprint nor ` +
            `appear in the EXEMPT ledger. Add revalidation (or a justified ` +
            `exemption):\n${uncovered.map((p) => `  ${p}`).join("\n")}`
    ).toEqual([]);
  });

  it("inline_delete still revalidates the submitted current pathname", () => {
    // super_admin.inline_delete's map entry pins only the static "/admin"
    // fallback — its primary target is the client-derived `path` (usePathname,
    // /admin-prefix-validated), which no static fingerprint can represent.
    // This sentinel pins the dynamic element itself: if a future edit drops
    // the raw-path read or the /admin prefix guard, this fails even though
    // the map still matches.
    const file = ACTION_FILES.find((f) =>
      f.relPath.endsWith("super-admin/permanent-delete-actions.ts")
    );
    expect(file, "permanent-delete-actions.ts not found").toBeDefined();
    const body = file?.text ?? "";
    expect(
      /readStr\(raw,\s*["']path["']\)/.test(body) &&
        /startsWith\(["']\/admin["']\)/.test(body),
      `super_admin.inline_delete no longer derives a revalidate target from ` +
        `the submitted pathname (readStr(raw, "path") + the "/admin" prefix ` +
        `guard). Restore it, or redesign the dynamic revalidation and update ` +
        `this sentinel.`
    ).toBe(true);
  });
});
