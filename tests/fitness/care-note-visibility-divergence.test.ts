import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  applicableGrantProfileId,
  canReadNote,
  type NoteSubjectMeta,
  type NoteViewer,
  type TransparencyGrant,
} from "@/lib/admin/care-note-visibility";
import {
  AUTHOR_ID,
  SUBJECT_ID,
  enumerateVisibilityMatrix,
  type VisibilityMatrixRow,
} from "@/lib/admin/__tests__/care-note-visibility-matrix";
import {
  readSourceFiles,
  repoRoot,
  type SourceFile,
} from "./support/source-globber";
import { stripSqlComments } from "./support/scan";

// Security invariant (audit 2026-06-21 SEC-1 / TEST-5c; deepened 2026-07-07 /
// ADR 0037): the Care Note read boundary is expressed TWICE — once in
// TypeScript (`lib/admin/care-note-visibility.ts::canReadNote`, the app-layer
// copy the UI uses to decide what to even attempt to render) and once in SQL
// RLS (the `care_notes_author_or_granted_select` policy, the REAL boundary).
// They must stay hand-synchronised; a UI change without the matching migration
// (or vice versa) is silent divergence.
//
// The pin has three layers, each catching what the previous can't:
//
//   1. SHAPE (the original audit pin, kept unchanged): folds the NET-EFFECTIVE
//      policy across all migrations (append-only history: a later migration
//      can drop/recreate the policy with a different USING) and asserts the
//      load-bearing BOOLEAN RELATIONSHIP — author OR (admin AND grant) — is
//      intact on both sides, with no broader Super-Admin bypass.
//   2. FRESHNESS: the folded USING clause must equal PINNED_CARE_NOTES_USING
//      verbatim, and the prayer_requests policy must be its exact sibling.
//      The pinned text is what the TS mirror below transcribes — the equality
//      is what makes the differential layer trustworthy.
//   3. BEHAVIORAL DIFFERENTIAL: `sqlCanReadNote` (a TS transcription of the
//      pinned USING clause) and the production resolver run over EVERY row of
//      the shared input matrix (lib/admin/__tests__/care-note-visibility-
//      matrix.ts — both note types, every viewer role/identity, independent
//      author/subject grant states) and must agree. This is what the shape
//      layer can't see: e.g. swapping the two grant keys (gating a subject
//      note on the AUTHOR's toggle) passes every regex but disagrees with the
//      resolver on concrete rows and fails here.
//
// The TS resolver carries the reciprocal pointer in its header comment; this
// test fails the build if the two drift. The opt-in integration lane
// (tests/integration/rls-visibility.test.ts) additionally exercises the real
// policy against a live local stack.

const ROOT = repoRoot();
const TS_PATH = "lib/admin/care-note-visibility.ts";
const POLICY = "care_notes_author_or_granted_select";
const PRAYER_POLICY = "prayer_requests_author_or_granted_select";

// The net-effective USING clause `sqlCanReadNote` below transcribes, pinned
// verbatim (whitespace-normalized by effectivePolicyUsing). If a migration
// changes the policy, this test fails HERE first: re-transcribe the mirror,
// re-verify the differential suite passes, THEN update this constant. The
// friction is deliberate — the mirror must never silently rot.
// (The helper calls are `(select …)`-wrapped since 20260714010000 — an
// InitPlan-only change, #860; the boolean relationship is identical.)
const PINNED_CARE_NOTES_USING =
  "author_profile_id = (select public.auth_profile_id()) or ( (select " +
  "public.auth_is_admin()) and ( ( care_notes.subject_profile_id is not null " +
  "and exists ( select 1 from public.note_transparency_grants g where " +
  "g.subject_profile_id = care_notes.subject_profile_id and g.granted ) ) or " +
  "( care_notes.subject_group_id is not null and exists ( select 1 from " +
  "public.note_transparency_grants g where g.subject_profile_id = " +
  "care_notes.author_profile_id and g.granted ) ) ) )";

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
    // Author arm: the author always reads their own note. The helper is
    // InitPlan-wrapped (`(select public.auth_profile_id())`, #860); the
    // `(?:\(select\s+)?` tolerates either form without weakening the arm.
    expect(using).toMatch(
      /author_profile_id\s*=\s*(?:\(select\s+)?public\.auth_profile_id\(\)/i
    );
    // Oversight-ladder arm: the admin check must be ANDed with the grant — not
    // merely present somewhere. A widened clause like `… OR auth_is_admin() OR
    // g.granted` (admins read every note without a grant) must FAIL this.
    expect(using).toMatch(
      /public\.auth_is_admin\(\)\)?\s+and\b[\s\S]*\bg\.granted\b/i
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

describe("fitness: the SQL mirror is fresh (SEC-1 layer 2)", () => {
  it("the folded care_notes USING clause equals the pinned transcription source", () => {
    expect(effectivePolicyUsing(MIGRATIONS, POLICY)).toBe(
      PINNED_CARE_NOTES_USING
    );
  });

  it("the prayer_requests policy is the exact sibling, so one mirror covers both", () => {
    const prayer = effectivePolicyUsing(MIGRATIONS, PRAYER_POLICY);
    expect(prayer.length).toBeGreaterThan(0);
    expect(prayer.replaceAll("prayer_requests", "care_notes")).toBe(
      PINNED_CARE_NOTES_USING
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 3: behavioral differential. `sqlCanReadNote` transcribes
// PINNED_CARE_NOTES_USING into TypeScript, arm by arm; the freshness pin above
// guarantees the transcription source is the live policy. The production
// resolver and the mirror then decide every row of the shared input matrix and
// must agree — a genuine semantic divergence (not just a reworded clause)
// between resolver and policy shows up as a concrete disagreeing row.
// ---------------------------------------------------------------------------

// `grants` maps a profile id to its toggle; a missing entry is "no grant row".
// `exists (… where g.subject_profile_id = <id> and g.granted)` is true only
// for a present row with granted = true.
function sqlCanReadNote(
  note: NoteSubjectMeta,
  viewer: NoteViewer,
  grants: ReadonlyMap<string, boolean>
): boolean {
  // author_profile_id = public.auth_profile_id()
  if (note.authorProfileId === viewer.profileId) return true;
  // public.auth_is_admin() — auth_role() in ('super_admin','ministry_admin')
  // (20260518000000_phase4_rls.sql).
  if (viewer.role !== "ministry_admin" && viewer.role !== "super_admin") {
    return false;
  }
  const granted = (id: string | null) => id !== null && grants.get(id) === true;
  return (
    // subject arm: care_notes.subject_profile_id is not null and exists(...)
    (note.subjectProfileId !== null && granted(note.subjectProfileId)) ||
    // author arm: care_notes.subject_group_id is not null and exists(...)
    (note.subjectGroupId !== null && granted(note.authorProfileId))
  );
}

function grantRows(row: VisibilityMatrixRow): ReadonlyMap<string, boolean> {
  const rows = new Map<string, boolean>();
  if (row.grants.author !== "absent") {
    rows.set(AUTHOR_ID, row.grants.author === "on");
  }
  if (row.grants.subject !== "absent") {
    rows.set(SUBJECT_ID, row.grants.subject === "on");
  }
  return rows;
}

describe("fitness: TS resolver and SQL mirror agree on every matrix row (SEC-1 layer 3)", () => {
  const matrix = enumerateVisibilityMatrix();

  it("enumerates the full matrix (2 note shapes × 15 viewers × 9 grant states)", () => {
    expect(matrix).toHaveLength(270);
  });

  it("decides every read attempt identically on both sides", () => {
    for (const row of matrix) {
      const grants = grantRows(row);
      const sql = sqlCanReadNote(row.note, row.viewer, grants);

      // The resolver takes the already-selected applicable grant; the
      // selection rule (whose toggle gates this note) is the exported helper.
      const gatingId = applicableGrantProfileId(row.note);
      const gatingState = grants.get(gatingId);
      const grant: TransparencyGrant =
        gatingState === undefined ? null : { granted: gatingState };
      const resolver = canReadNote(
        row.viewer,
        {
          authorProfileId: row.note.authorProfileId,
          subjectProfileId: gatingId,
        },
        grant
      );

      expect(
        resolver,
        `resolver=${resolver} sql=${sql} for ${JSON.stringify(row)}`
      ).toBe(sql);
    }
  });
});
