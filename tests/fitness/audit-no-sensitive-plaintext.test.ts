import { describe, expect, it } from "vitest";

import {
  DATA_CLASSIFICATION,
  type Classification,
} from "@/lib/security/data-classification";
import { readSourceFiles, type SourceFile } from "./support/source-globber";
import { stripSqlStrings } from "./support/scan";
import { effectiveFunctions, parseSqlFunctions } from "./support/sql-functions";
import {
  auditFieldPairs,
  auditMetadataBlocks,
  collectVariableAssignments,
  doBlockBodies,
  expandVariableReferences,
  isContentFreeValue,
  preprocessKeepStrings,
} from "./support/audit-trace";

// Audit-leak guard (issue #699, generalizing the SC.4 content-free proof in
// lib/admin/__tests__/sc4-boundary-proof.test.ts to the whole classification
// manifest). Freeform pastoral/prayer bodies, encrypted material, tokens,
// secrets, and danger-zone snapshots must never reach `audit_events` metadata as
// a stored VALUE — the audit spine records PRESENCE (`has_<col>`, `<col> is not
// null`) and IDs, never the sensitive plaintext, so it stays shareable without
// leaking pastoral context.
//
// DELIBERATE EXCEPTION — PII identity (full_name / email / phone): these ARE
// recorded for identity-management events (profile/over-shepherd/invite writes),
// mirroring the denormalized `audit_events.actor_name` / `actor_email` columns.
// They are classified `pii`, which is excluded from the SEALED set below.
//
// DELIBERATE EXCEPTION — admin-private freeform text (`admin_private`): per the
// #706 policy confirmation, admin-private notes ARE in-policy in audit metadata.
// `audit_events` is SUPER-ADMIN-ONLY, and `admin_private` means "hidden from
// Leaders", not from the Super Admin — who sits atop the oversight ladder and
// may read admin-private content. So `admin_private` is excluded from SEALED:
// columns classified ONLY admin-private (e.g. `admin_metric_notes`, the
// church-attendance `note`) are not flagged. A column name that is ALSO sealed
// elsewhere (e.g. `notes`, which is `sensitive_care` in care tables) stays
// sealed by name — and the admin-private launch-planning path that uses `notes`
// already redacts to `has_notes` for audit, so it passes on its presence form.
//
// COVERAGE (issues #706/#710, closing the prior known limitation): the scan
// folds `CREATE OR REPLACE` history to each function's EFFECTIVE state (via
// `effectiveFunctions`, mirroring the #697 search_path check) so superseded
// revisions aren't re-scanned, and it traces values assembled into a plpgsql
// variable before the insert — `v_x := jsonb_build_object(...)`, typed
// DECLARE-block initializers (`v_x jsonb := …`), and single-target JSON
// `SELECT jsonb_build_object(...) INTO v_x` snapshots — by expanding each audit
// insert with the right-hand sides of the variables it references. Each expanded
// payload is then scanned TWO complementary ways:
//   - KEY-AWARE: every `jsonb_build_object('<field>', <value>)` pair — a sealed
//     audit FIELD with a non-presence value is a leak, however the value is named
//     or sanitized into an alias; an admin-private-ONLY field (`admin_metric_notes`)
//     is in-policy. This is what disambiguates the overloaded `notes` field
//     (sealed when keyed as `'notes'`, in-policy when keyed `'admin_metric_notes'`).
//   - TOKEN: the expanded text (strings stripped) — a sealed value carried under a
//     NON-sealed key (`jsonb_build_object('x', v_body)`) is still caught.
// Audit inserts in DO-block backfills (never superseded, so not function-folded)
// are scanned from raw migration text with their DO-block variables traced. The
// truly-sealed bodies (care/prayer/SC.4 encrypted) are still proven content-free
// of audit here and in sc4-boundary-proof.test.ts.

// Classifications whose column VALUES must never reach audit metadata by ANY
// path — insert site OR variable indirection. `pii`, `operational_metadata`,
// `audit`, and `admin_private` are intentionally absent (see the exceptions
// above): PII identity is deliberately audited, the next two aren't sensitive
// bodies, and admin-private text is in-policy in Super-Admin-only audit.
const SEALED: ReadonlySet<Classification> = new Set([
  "sensitive_care",
  "prayer_request",
  "encrypted_private",
  "invite_auth",
  "danger_zone_snapshot",
  "policy_tbd",
]);

// Every column name classified sealed anywhere in the manifest.
const sealedColumns: readonly string[] = [
  ...new Set(
    DATA_CLASSIFICATION.flatMap((t) =>
      (t.columns ?? [])
        .filter((c) => SEALED.has(c.classification))
        .map((c) => c.column)
    )
  ),
].sort();

// Column NAMES that are ALSO classified admin-private somewhere. A name is
// "overloaded" when it is sealed in one table but admin-private in another — the
// only such name today is `notes` (`sensitive_care` on care tables, but
// `admin_private` on launch-planning / over-shepherd settings). The TOKEN matcher
// can't tell which a `v_notes` / `p_notes` variable holds, so for an overloaded
// name it flags only a real column copy (a bare `<col>` or `<alias>.<col>`
// reference), not the `v_<col>` / `p_<col>` variable form. The KEY-AWARE matcher
// covers the gap that leaves: a value keyed under the sealed field `'notes'` is
// flagged regardless of how it is named (and `admin_metric_notes` stays in-policy
// because that key is admin-private-only, never in `sealedColumns`).
const adminPrivateNames: ReadonlySet<string> = new Set(
  DATA_CLASSIFICATION.flatMap((t) =>
    (t.columns ?? [])
      .filter((c) => c.classification === "admin_private")
      .map((c) => c.column)
  )
);

// The TOKEN matcher for one sealed column. `\b`-anchored so presence/flag params
// (`p_set_<col>`, `v_has_<col>`) and longer columns (`notes` vs `note`) never
// match. Overloaded names drop the variable/param alternatives (see above).
function sealedColumnPattern(col: string): RegExp {
  const columnRef = `\\b\\w+\\.${col}\\b|\\b${col}\\b`;
  return adminPrivateNames.has(col)
    ? new RegExp(columnRef, "g")
    : new RegExp(`\\bv_${col}\\b|\\bp_${col}\\b|${columnRef}`, "g");
}

// The KEY-AWARE matcher: an audit field whose key names a sealed column. Built
// from the same manifest; admin-private-only fields (e.g. `admin_metric_notes`)
// are absent, so keying a value under them stays in-policy.
const sealedFieldKeys: ReadonlySet<string> = new Set(sealedColumns);

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

// One audit insert to scan: the insert block expanded with the right-hand sides
// of any plpgsql variables it references, plus where it is defined for the report.
interface AuditScanUnit {
  readonly relPath: string;
  readonly text: string;
}

// (1) Effective function bodies — `CREATE OR REPLACE` history folded so only the
// final definition of each signature is scanned (superseded revisions, possibly
// with since-fixed leaks, are not re-reported).
function effectiveUnits(files: readonly SourceFile[]): AuditScanUnit[] {
  const units: AuditScanUnit[] = [];
  for (const fn of effectiveFunctions(files)) {
    const blocks = auditMetadataBlocks(fn.body, { stripDollar: true });
    if (blocks.length === 0) continue;
    const assignments = collectVariableAssignments(
      preprocessKeepStrings(fn.body, { stripDollar: true })
    );
    for (const block of blocks) {
      units.push({
        relPath: fn.definedAt,
        text: expandVariableReferences(block, assignments),
      });
    }
  }
  return units;
}

// (2) Audit inserts NOT hosted by a function (DO-block backfills, top-level
// statements). These are append-only — never superseded — so they're taken from
// raw migration text, minus the blocks that belong to a function in the same file
// (those are covered, folded, by `effectiveUnits`). DO-block variables are traced
// from the DO-block bodies so a same-named variable in a sibling CREATE FUNCTION
// can't pollute the expansion.
function nonFunctionUnits(files: readonly SourceFile[]): AuditScanUnit[] {
  const units: AuditScanUnit[] = [];
  for (const file of files) {
    const raw = auditMetadataBlocks(file.text);
    if (raw.length === 0) continue;
    const { creates } = parseSqlFunctions(file);
    const functionPool = creates.flatMap((c) =>
      auditMetadataBlocks(c.body, { stripDollar: true })
    );
    const nonFunction: string[] = [];
    for (const block of raw) {
      const i = functionPool.indexOf(block);
      if (i >= 0) functionPool.splice(i, 1);
      else nonFunction.push(block);
    }
    if (nonFunction.length === 0) continue;
    const assignments = collectVariableAssignments(
      doBlockBodies(file.text)
        .map((b) => preprocessKeepStrings(b, { stripDollar: true }))
        .join("\n")
    );
    for (const block of nonFunction) {
      units.push({
        relPath: file.relPath,
        text: expandVariableReferences(block, assignments),
      });
    }
  }
  return units;
}

function auditScanUnits(files: readonly SourceFile[]): AuditScanUnit[] {
  return [...effectiveUnits(files), ...nonFunctionUnits(files)];
}

const ALL_UNITS: readonly AuditScanUnit[] = auditScanUnits(MIGRATIONS);

// KEY-AWARE leaks: an audit field whose key names a sealed column, carrying a
// value that is not a presence/cardinality reduction. Catches a sealed value
// however it is named or sanitized into an alias, and disambiguates the
// overloaded `notes` field (sealed under `'notes'`, in-policy under the
// admin-private-only `'admin_metric_notes'`).
function sealedKeyLeaks(unit: AuditScanUnit): string[] {
  const leaks: string[] = [];
  for (const pair of auditFieldPairs(unit.text)) {
    if (pair.key === null || !sealedFieldKeys.has(pair.key)) continue;
    if (isContentFreeValue(pair.value)) continue;
    const value = pair.value.replace(/\s+/g, " ").slice(0, 50);
    leaks.push(`  ${unit.relPath}  key='${pair.key}'  →  ${value}`);
  }
  return leaks;
}

// TOKEN leaks: a sealed column VALUE appearing in the expanded payload (strings
// stripped so a key/label literal can't masquerade as a column). Catches a sealed
// value carried under a NON-sealed key. A reference is allowed as a presence
// predicate (`<ref> is [not] null`) or as the argument of a cardinality/type
// reduction (`jsonb_array_length(...)`).
function sealedTokenLeaks(unit: AuditScanUnit): string[] {
  const leaks: string[] = [];
  const text = stripSqlStrings(unit.text);
  for (const col of sealedColumns) {
    const re = sealedColumnPattern(col);
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const after = text.slice(m.index + m[0].length).trimStart();
      if (/^is\s+(not\s+)?null\b/i.test(after)) continue;
      // `length` / `char_length` are deliberately NOT allowed here: a body's
      // character count is content-adjacent.
      const before = text.slice(0, m.index);
      if (
        /\b(?:jsonb_array_length|array_length|cardinality|jsonb_typeof)\s*\(\s*$/i.test(
          before
        )
      )
        continue;
      const ctx = text
        .slice(Math.max(0, m.index - 30), m.index + m[0].length + 20)
        .replace(/\s+/g, " ")
        .trim();
      leaks.push(`  ${unit.relPath}  [${col}]  …${ctx}…`);
    }
  }
  return leaks;
}

// Both complementary scans, deduped.
function sealedLeaks(unit: AuditScanUnit): string[] {
  return [...new Set([...sealedKeyLeaks(unit), ...sealedTokenLeaks(unit)])];
}

describe("fitness: audit_events metadata carries no sensitive plaintext", () => {
  it("inspects a non-trivial number of audit inserts and columns (sanity)", () => {
    expect(ALL_UNITS.length).toBeGreaterThan(20);
    expect(sealedColumns.length).toBeGreaterThan(10);
  });

  it("references sealed columns only as presence (is null / is not null), including via variables", () => {
    const leaks = ALL_UNITS.flatMap(sealedLeaks);
    expect(
      leaks,
      leaks.length === 0
        ? ""
        : `Audit metadata must record presence (has_<col> / <col> is not ` +
            `null), never the sealed value — including values assembled into a ` +
            `plpgsql variable first:\n${leaks.join("\n")}`
    ).toEqual([]);
  });

  // --- detection proofs (issue #706) ----------------------------------------
  // These run the SAME pipeline (`auditScanUnits` → `sealedLeaks`) the gating
  // assertion above uses, on synthetic migrations, to show the variable-tracing
  // and effective-state folding behave as intended.

  function sql(relPath: string, text: string): SourceFile {
    return { relPath, absPath: `/repo/${relPath}`, text };
  }

  it("DETECTS a sealed care body reaching audit only through a v_* := jsonb_build_object(...) variable", () => {
    const file = sql(
      "m_leak.sql",
      `create or replace function public.leaky() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_after jsonb; v_body text;
       begin
         v_body := 'a pastoral note';
         v_after := jsonb_build_object('body', v_body);
         insert into public.audit_events (action, metadata)
           values ('x', jsonb_build_object('after', v_after));
       end $$;`
    );
    const leaks = auditScanUnits([file]).flatMap(sealedLeaks);
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.join("\n")).toMatch(/\[body\]/);
  });

  it("does NOT flag a presence-only variable feeding audit (has_body, v_body is not null)", () => {
    const file = sql(
      "m_presence.sql",
      `create or replace function public.safe_presence() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_after jsonb; v_body text;
       begin
         v_body := 'a pastoral note';
         v_after := jsonb_build_object('has_body', v_body is not null);
         insert into public.audit_events (action, metadata)
           values ('x', jsonb_build_object('after', v_after));
       end $$;`
    );
    expect(auditScanUnits([file]).flatMap(sealedLeaks)).toEqual([]);
  });

  it("does NOT flag an in-policy admin-private note (admin_metric_notes via v_notes) in Super-Admin-only audit", () => {
    const file = sql(
      "m_admin_private.sql",
      `create or replace function public.admin_metric_write() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_after jsonb; v_notes text;
       begin
         v_notes := nullif(btrim(coalesce(p_admin_metric_notes, '')), '');
         v_after := jsonb_build_object('admin_metric_notes', v_notes);
         insert into public.audit_events (action, metadata)
           values ('x', jsonb_build_object('after', v_after));
       end $$;`
    );
    expect(auditScanUnits([file]).flatMap(sealedLeaks)).toEqual([]);
  });

  it("does NOT over-report a superseded revision once a later CREATE OR REPLACE removes the leak", () => {
    const leakyV1 = sql(
      "20000101000000_v1.sql",
      `create or replace function public.evolving() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_after jsonb; v_body text;
       begin
         v_after := jsonb_build_object('body', v_body);
         insert into public.audit_events (action, metadata)
           values ('x', jsonb_build_object('after', v_after));
       end $$;`
    );
    const fixedV2 = sql(
      "20000102000000_v2.sql",
      `create or replace function public.evolving() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_after jsonb; v_body text;
       begin
         v_after := jsonb_build_object('has_body', v_body is not null);
         insert into public.audit_events (action, metadata)
           values ('x', jsonb_build_object('after', v_after));
       end $$;`
    );
    // V1 alone leaks; V1 folded with the later V2 does not (effective state wins).
    expect(
      auditScanUnits([leakyV1]).flatMap(sealedLeaks).length
    ).toBeGreaterThan(0);
    expect(auditScanUnits([leakyV1, fixedV2]).flatMap(sealedLeaks)).toEqual([]);
  });

  // --- detection proofs for the #710 review (Codex P1 blind spots) ----------

  it("DETECTS a typed DECLARE-block initializer (v_after jsonb := jsonb_build_object('body', v_body))", () => {
    const file = sql(
      "m_declare.sql",
      `create or replace function public.declared() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_body text; v_after jsonb := jsonb_build_object('body', v_body);
       begin
         insert into public.audit_events (action, metadata) values ('x', v_after);
       end $$;`
    );
    expect(auditScanUnits([file]).flatMap(sealedLeaks).length).toBeGreaterThan(
      0
    );
  });

  it("DETECTS a JSON SELECT … INTO snapshot (select jsonb_build_object('spiritual_growth_note', …) into v_before)", () => {
    const file = sql(
      "m_into.sql",
      `create or replace function public.snapshot() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_before jsonb;
       begin
         select jsonb_build_object('spiritual_growth_note', spiritual_growth_note)
           into v_before from public.shepherd_care_status_history limit 1;
         insert into public.audit_events (action, metadata)
           values ('x', jsonb_build_object('before', v_before));
       end $$;`
    );
    expect(auditScanUnits([file]).flatMap(sealedLeaks).length).toBeGreaterThan(
      0
    );
  });

  it("DETECTS a sealed value sanitized into a differently-named alias (key-aware: 'leader_visible_note')", () => {
    const file = sql(
      "m_alias.sql",
      `create or replace function public.aliased() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_clean text; v_after jsonb;
       begin
         v_clean := btrim(coalesce(p_leader_visible_note, ''));
         v_after := jsonb_build_object('leader_visible_note', v_clean);
         insert into public.audit_events (action, metadata) values ('x', v_after);
       end $$;`
    );
    expect(auditScanUnits([file]).flatMap(sealedLeaks).length).toBeGreaterThan(
      0
    );
  });

  it("DETECTS the overloaded 'notes' field carrying a care note (key 'notes', not 'admin_metric_notes')", () => {
    const file = sql(
      "m_overloaded.sql",
      `create or replace function public.care_regress() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       declare v_after jsonb;
       begin
         v_after := jsonb_build_object('notes', p_notes);
         insert into public.audit_events (action, metadata) values ('x', v_after);
       end $$;`
    );
    expect(auditScanUnits([file]).flatMap(sealedLeaks).length).toBeGreaterThan(
      0
    );
  });

  it("does NOT flag a constant string literal under a sealed field key (hardcoded backfill 'reason')", () => {
    const file = sql(
      "m_const.sql",
      `create or replace function public.const_reason() returns void
       language plpgsql security definer set search_path = public, pg_temp as $$
       begin
         insert into public.audit_events (action, metadata)
           values ('x', jsonb_build_object('reason', 'ADR 0024 backfill'));
       end $$;`
    );
    expect(auditScanUnits([file]).flatMap(sealedLeaks)).toEqual([]);
  });
});
