import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { repoRoot } from "./support/source-globber";
import { stripSqlComments } from "./support/scan";

// Security invariant (audit 2026-06-21 SEC-1 / TEST-5c): the Care Note read
// boundary is expressed TWICE — once in TypeScript (`lib/admin/care-note-
// visibility.ts::canReadNote`, the app-layer copy the UI uses to decide what to
// even attempt to render) and once in SQL RLS (the `care_notes_author_or_granted
// _select` policy, the REAL boundary). They must stay hand-synchronised; a UI
// change without the matching migration (or vice versa) is silent divergence.
//
// This is the machine-checked pin the audit asked for. It parses the policy's
// `USING` clause and asserts the three load-bearing predicates that mirror the
// resolver are present on BOTH sides, and that neither side grants the Super
// Admin a broader bypass than the Ministry Admin (the deliberate "no more" of
// the truth table). The TS resolver carries the reciprocal pointer in its header
// comment; this test is the cross-reference that fails the build if they drift.

const ROOT = repoRoot();
const TS_PATH = "lib/admin/care-note-visibility.ts";
const SQL_PATH =
  "supabase/migrations/20260608090000_phase_pivot9_care_notes.sql";

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

// Extract the `USING ( … )` clause of the named SELECT policy, balanced to the
// matching close paren. Comments are stripped first so an illustrative example
// can't be mistaken for the real clause.
function policyUsingClause(sql: string, policyName: string): string {
  const text = stripSqlComments(sql);
  const create = new RegExp(`create\\s+policy\\s+${policyName}\\b`, "i").exec(
    text
  );
  if (!create) return "";
  const usingMatch = /\busing\b/i.exec(text.slice(create.index));
  if (!usingMatch) return "";
  const from = create.index + usingMatch.index;
  const open = text.indexOf("(", from);
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

describe("fitness: Care Note TS resolver matches the RLS USING clause (SEC-1)", () => {
  const using = policyUsingClause(
    read(SQL_PATH),
    "care_notes_author_or_granted_select"
  );
  const ts = read(TS_PATH);

  it("the care_notes SELECT policy USING clause is found (guards against drift in the migration name)", () => {
    expect(using.length).toBeGreaterThan(0);
  });

  it("the RLS USING clause carries the three load-bearing predicates", () => {
    // Author arm: the author always reads their own note.
    expect(using).toMatch(
      /author_profile_id\s*=\s*public\.auth_profile_id\(\)/i
    );
    // Oversight-ladder arm: gated on the admin check.
    expect(using).toMatch(/public\.auth_is_admin\(\)/i);
    // Grant gate: only when the subject's transparency grant is ON.
    expect(using).toMatch(/\bg\.granted\b/i);
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
