import { describe, expect, it } from "vitest";

import {
  DATA_CLASSIFICATION,
  type Classification,
} from "@/lib/security/data-classification";
import { readSourceFiles } from "./support/source-globber";
import { stripSqlComments } from "./support/scan";

// Audit-leak guard (issue #699, generalizing the SC.4 content-free proof in
// lib/admin/__tests__/sc4-boundary-proof.test.ts to the whole classification
// manifest). Freeform pastoral/prayer/admin-private bodies, encrypted material,
// tokens, secrets, and danger-zone snapshots must never reach `audit_events`
// metadata as a stored VALUE — the audit spine records PRESENCE (`has_<col>`,
// `<col> is not null`) and IDs, never the sensitive plaintext, so it stays
// shareable without leaking pastoral context.
//
// DELIBERATE EXCEPTION — PII identity (full_name / email / phone): these ARE
// recorded for identity-management events (profile/over-shepherd/invite writes),
// mirroring the denormalized `audit_events.actor_name` / `actor_email` columns.
// They are classified `pii`, which is excluded from the HIGH_RISK set below; the
// catastrophic-leak categories (care/prayer/admin-private/encrypted/secret/
// snapshot) and any unresolved `policy_tbd` field are what this check seals.
//
// SCOPE / KNOWN LIMITATION (tracked as a follow-up): this scan inspects the
// `insert into public.audit_events …` statement only. A value assembled into a
// plpgsql variable first (e.g. `v_after := jsonb_build_object('admin_metric_notes',
// v_notes); insert … values (…, 'after', v_after)`) is NOT traced, so the
// catastrophic categories are sealed at the insert site but an admin-private note
// reaching audit via a variable is not flagged here. That gap is acceptable today
// because the only such values are ADMIN-PRIVATE freeform notes
// (`admin_metric_notes`, launch-planning `notes`, church-attendance `note`) landing
// in the SUPER-ADMIN-ONLY `audit_events` table — and `admin_private` means
// "hidden from Leaders", not from the Super Admin, who sits atop the oversight
// ladder and may read admin-private content. The truly-sealed bodies
// (care/prayer/SC.4 encrypted) never reach audit (proven below + in
// sc4-boundary-proof.test.ts). Extending this to effective-state variable tracing
// + a policy confirmation is the follow-up.

// Classifications whose COLUMN VALUES must never be copied into audit metadata.
// `pii`, `operational_metadata`, and `audit` are intentionally absent (PII
// identity is deliberately audited; the other two aren't sensitive bodies).
const HIGH_RISK: ReadonlySet<Classification> = new Set([
  "sensitive_care",
  "prayer_request",
  "admin_private",
  "encrypted_private",
  "invite_auth",
  "danger_zone_snapshot",
  "policy_tbd",
]);

// Every column name classified high-risk anywhere in the manifest.
const highRiskColumns: readonly string[] = [
  ...new Set(
    DATA_CLASSIFICATION.flatMap((t) =>
      (t.columns ?? [])
        .filter((c) => HIGH_RISK.has(c.classification))
        .map((c) => c.column)
    )
  ),
].sort();

// Blank single-quoted SQL string literals to spaces (handling the `''` escape),
// so jsonb KEY names (`'has_admin_summary'`) and hardcoded label VALUES
// (`'ADR 0024 …'`) can't masquerade as a column reference. Newlines preserved.
function stripSqlStrings(sql: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (!inString) {
      if (c === "'") {
        inString = true;
        out += " ";
      } else {
        out += c;
      }
    } else if (c === "'" && sql[i + 1] === "'") {
      out += "  ";
      i++;
    } else if (c === "'") {
      inString = false;
      out += " ";
    } else {
      out += c === "\n" ? "\n" : " ";
    }
  }
  return out;
}

// Slice every `insert into public.audit_events …;` statement, balanced to the
// statement-terminating `;` at paren-depth 0 (so a sibling `insert into members`
// in the same RPC body is excluded). Comments/strings are stripped first.
function auditInsertBlocks(sqlText: string): string[] {
  const text = stripSqlStrings(stripSqlComments(sqlText));
  const lower = text.toLowerCase();
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const start = lower.indexOf("insert into public.audit_events", from);
    if (start === -1) break;
    let depth = 0;
    let end = text.length;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === ";" && depth <= 0) {
        end = i;
        break;
      }
    }
    blocks.push(text.slice(start, end));
    from = start + 1;
  }
  return blocks;
}

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

const ALL_BLOCKS = MIGRATIONS.flatMap((f) =>
  auditInsertBlocks(f.text).map((block) => ({ relPath: f.relPath, block }))
);

describe("fitness: audit_events metadata carries no sensitive plaintext", () => {
  it("inspects a non-trivial number of audit inserts and columns (sanity)", () => {
    expect(ALL_BLOCKS.length).toBeGreaterThan(20);
    expect(highRiskColumns.length).toBeGreaterThan(10);
  });

  it("references high-risk columns only as presence (is null / is not null)", () => {
    const leaks: string[] = [];
    for (const { relPath, block } of ALL_BLOCKS) {
      for (const col of highRiskColumns) {
        // Value-bearing references to the column: a `v_<col>` / `p_<col>`
        // variable, an `<alias>.<col>` row reference, or a bare `<col>` column.
        // Each is `\b`-anchored so presence/flag params (`p_set_<col>`,
        // `v_has_<col>`) and longer columns (`notes` vs `note`) never match.
        const re = new RegExp(
          `\\bv_${col}\\b|\\bp_${col}\\b|\\b\\w+\\.${col}\\b|\\b${col}\\b`,
          "g"
        );
        for (let m = re.exec(block); m; m = re.exec(block)) {
          const after = block.slice(m.index + m[0].length).trimStart();
          // Allowed: `<ref> is [not] null` presence predicate. A value
          // reference used anywhere else (`'after', v_<col>`) is a leak.
          if (/^is\s+(not\s+)?null\b/i.test(after)) continue;
          const ctx = block
            .slice(Math.max(0, m.index - 30), m.index + m[0].length + 20)
            .replace(/\s+/g, " ")
            .trim();
          leaks.push(`  ${relPath}  [${col}]  …${ctx}…`);
        }
      }
    }
    expect(
      leaks,
      leaks.length === 0
        ? ""
        : `Audit metadata must record presence (has_<col> / <col> is not ` +
            `null), never the sensitive value:\n${leaks.join("\n")}`
    ).toEqual([]);
  });
});
