import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readSourceFiles,
  repoRoot,
  type SourceFile,
} from "./support/source-globber";
import { stripSqlComments } from "./support/scan";

// Security invariant (audit 2026-06-21 SEC-1 / TEST-5c): the Care Note read
// boundary is expressed TWICE — once in TypeScript (`lib/admin/care-note-
// visibility.ts::canReadNote`, the app-layer copy the UI uses to decide what to
// even attempt to render) and once in SQL RLS (the `care_notes_author_or_granted
// _select` policy, the REAL boundary). They must stay hand-synchronised; a UI
// change without the matching migration (or vice versa) is silent divergence.
//
// This is the machine-checked pin the audit asked for. It folds the
// NET-EFFECTIVE policy across all migrations (append-only history: a later
// migration can drop/recreate the policy with a different USING), parses that
// clause, and asserts the load-bearing BOOLEAN RELATIONSHIP that mirrors the
// resolver — author OR (admin AND grant) — is intact on BOTH sides, with no
// broader Super-Admin bypass. The TS resolver carries the reciprocal pointer in
// its header comment; this test fails the build if the two drift.

const ROOT = repoRoot();
const TS_PATH = "lib/admin/care-note-visibility.ts";
const POLICY = "care_notes_author_or_granted_select";

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

// Read the balanced `( … )` group whose `(` is the first one at/after `from`.
function readParens(text: string, from: number): string {
  const open = text.indexOf("(", from);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) {
      return text
        .slice(open + 1, i)
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  return "";
}

// Fold CREATE/DROP POLICY for one policy name across all migrations (filename
// order, then textual order within a file) and return the NET-EFFECTIVE USING
// clause — so a later drop/recreate is what the test compares against, not the
// stale original definition.
function effectivePolicyUsing(
  files: readonly SourceFile[],
  policyName: string
): string {
  let effective = "";
  const createRe = new RegExp(`\\bcreate\\s+policy\\s+${policyName}\\b`, "gi");
  const dropRe = new RegExp(
    `\\bdrop\\s+policy\\s+(?:if\\s+exists\\s+)?${policyName}\\b`,
    "gi"
  );
  for (const file of files) {
    const text = stripSqlComments(file.text);
    const events: { pos: number; using: string | null }[] = [];
    createRe.lastIndex = 0;
    for (let m = createRe.exec(text); m; m = createRe.exec(text)) {
      const usingMatch = /\busing\b/i.exec(text.slice(m.index));
      const using = usingMatch
        ? readParens(text, m.index + usingMatch.index)
        : "";
      events.push({ pos: m.index, using });
    }
    dropRe.lastIndex = 0;
    for (let m = dropRe.exec(text); m; m = dropRe.exec(text)) {
      events.push({ pos: m.index, using: null });
    }
    events.sort((a, b) => a.pos - b.pos);
    for (const e of events) effective = e.using === null ? "" : e.using;
  }
  return effective;
}

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("fitness: Care Note TS resolver matches the RLS USING clause (SEC-1)", () => {
  const using = effectivePolicyUsing(MIGRATIONS, POLICY);
  const ts = read(TS_PATH);

  it("the net-effective care_notes SELECT policy USING clause is found", () => {
    expect(using.length).toBeGreaterThan(0);
  });

  it("the RLS USING clause keeps the author OR (admin AND grant) relationship", () => {
    // Author arm: the author always reads their own note.
    expect(using).toMatch(
      /author_profile_id\s*=\s*public\.auth_profile_id\(\)/i
    );
    // Oversight-ladder arm: the admin check must be ANDed with the grant — not
    // merely present somewhere. A widened clause like `… OR auth_is_admin() OR
    // g.granted` (admins read every note without a grant) must FAIL this.
    expect(using).toMatch(
      /public\.auth_is_admin\(\)\s+and\b[\s\S]*\bg\.granted\b/i
    );
    // And the grant must not be ORed in as a standalone all-rows escape hatch.
    expect(using).not.toMatch(/\bor\s+g\.granted\b/i);
  });

  it("the TS resolver mirrors the same three arms", () => {
    // Author arm.
    expect(ts).toMatch(/viewer\.profileId\s*===\s*note\.authorProfileId/);
    // Oversight-ladder arm gated on the grant being ON.
    expect(ts).toContain("LADDER_ROLES");
    expect(ts).toMatch(/grant\?\.granted\s*===\s*true/);
  });

  it("neither side grants the Super Admin a broader bypass than the Ministry Admin", () => {
    // RLS: the ladder arm is the single `auth_is_admin()`+grant gate — there is
    // no separate `super_admin` special-case that would let it read past a grant.
    expect(using).not.toMatch(/super_admin/i);
    // TS: both ladder roles are gated identically through LADDER_ROLES; there is
    // no role-specific early return that singles out super_admin.
    expect(ts).not.toMatch(/role\s*===\s*"super_admin"/);
  });
});
