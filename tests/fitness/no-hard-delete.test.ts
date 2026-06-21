import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";
import { effectiveFunctions } from "./support/sql-functions";

// Security invariant (CLAUDE.md / AGENTS.md P0, audit 2026-06-21 TEST-5):
// **No hard deletes in normal workflows.** Archive (soft — `archived_at` /
// status flags) is the default way anything leaves a surface. Permanent,
// destructive deletion is Super-Admin-only, writes a tombstone, and lives in
// the danger zone. This check converts that review-only rule into a build gate:
// every `DELETE FROM` inside a SECURITY DEFINER RPC body must belong to an
// explicitly allowlisted function — either a Super-Admin danger-zone deleter or
// the one sanctioned normal-workflow exception.
//
// Scope: function BODIES (the RPCs that run in normal/admin workflows), folded
// to their effective final definition via `support/sql-functions.ts` — the same
// per-signature fold the search_path and audit-pairing checks use, so a function
// re-created without a delete is judged by its final form, not its history.
// One-time top-level migration data fixups are intentionally out of scope (they
// are not workflow RPCs); the invariant is about deletes reachable as workflows.
//
// THE LOAD-BEARING SUBTLETY (audit §3): the no-hard-delete rule is NOT
// "deletes only exist in the danger zone". The normal leader check-in RPC
// (`leader_submit_group_checkin`) legitimately hard-deletes in a
// delete-then-reinsert "replace the week's rows" pattern. It is allowlisted
// below with that rationale so the check neither forces itself off nor lets a
// reviewer wrongly assume danger-zone-only.

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

// `DELETE FROM <table>` against a real table, in any form. The body is already
// comment-stripped (by the function parser), so we scan it WITH string literals
// intact: a destructive statement built as dynamic SQL — `EXECUTE 'delete from
// public.foo …'`, a `v_sql := 'delete from …'` variable, or `format(… delete
// from %I …)` — keeps its text inside a string, which `stripSqlStrings` would
// erase. Requiring a table-shaped target (`public.x`, a bare/quoted identifier,
// or a `%I`/`%s` placeholder) right after `delete from` keeps an incidental
// prose mention ("…cannot delete from …") from matching. This biases toward
// catching: an over-match fails loudly and a human allowlists it, whereas a
// missed delete silently bypasses the archive-by-default rule.
const DELETE_RE =
  /\bdelete\s+from\s+(?:public\.)?(?:%[is]\b|"?[a-z_][a-z0-9_]*"?)/i;

function deletesInBody(body: string): boolean {
  return DELETE_RE.test(body);
}

// Functions allowed to issue a `DELETE FROM`. Keyed by bare function name so a
// later additive `CREATE OR REPLACE` of the same RPC stays covered. Each entry
// is a deliberate, reviewed exemption — keep the reason current.
//
//  * Danger-zone permanent deleters & resets — Super-Admin-only, audit-paired,
//    tombstoned (ADR 0014, PRD-SAD/SAC6). These are the sanctioned home for
//    destructive deletion.
//  * SC.4 private-care-note KEY lifecycle (`admin_*`) — removes wrapped-DEK key
//    slots; a crypto key slot is revoked by deletion, not soft-archived.
//  * `check_invite_redeem_rate` — sliding-window throttle bookkeeping (mechanism
//    state, also in AUDIT_EXEMPT_WRITES); prunes expired rate-limit rows.
//  * `leader_submit_group_checkin` — the ONE domain normal-workflow exception: a
//    scoped, in-transaction delete-then-reinsert of the week's attendance /
//    health rows (audit 2026-06-21 §3). NOT a danger-zone deleter.
const HARD_DELETE_ALLOWLIST: ReadonlyMap<string, string> = new Map([
  // Super-Admin danger zone (ADR 0014 / PRD-SAD/SAC6): permanent deletion,
  // clean-slate wipes, and reset-to-baseline helpers. Destructive by design,
  // gated on the super_admin role, audit-paired, and tombstoned.
  [
    "super_admin_permanent_delete",
    "Danger zone: permanent deletion (ADR 0014).",
  ],
  ["super_admin_clean_slate_wipe", "Danger zone: clean-slate wipe (PRD-SAC6)."],
  [
    "super_admin_launch_prep",
    "Danger zone: launch-prep clean slate (PRD-SAC6).",
  ],
  ["super_admin_reset_audit_logs", "Danger zone: audit-log reset (PRD-SAC6)."],
  [
    "super_admin_reset_history_category",
    "Danger zone: per-category history reset.",
  ],
  ["super_admin_reset_activity", "Danger zone: activity-baseline reset."],
  [
    "super_admin_clear_activity_reset",
    "Danger zone: clears an activity-reset baseline.",
  ],
  [
    "super_admin_reset_care_attention",
    "Danger zone: care-attention baseline reset.",
  ],
  [
    "super_admin_reset_health_attention",
    "Danger zone: health-attention baseline reset.",
  ],
  [
    "super_admin_reset_attention_revert",
    "Danger zone: reverts an attention-reset baseline.",
  ],
  // SC.4 private-care-note key lifecycle: removing a wrapped-DEK key slot is the
  // correct way to revoke crypto-key access — there is nothing to soft-archive.
  [
    "admin_remove_private_note_key_slot",
    "SC.4 key lifecycle: revokes a wrapped-DEK key slot (crypto key removal).",
  ],
  [
    "admin_rotate_private_note_recovery",
    "SC.4 key lifecycle: rotates the recovery key, replacing old key slots.",
  ],
  // Rate-limit mechanism state (Phase IL.2; also AUDIT_EXEMPT_WRITES): prunes
  // expired sliding-window throttle rows. Service-role-only bookkeeping.
  [
    "check_invite_redeem_rate",
    "Rate-limit bookkeeping: prunes expired invite_redeem_throttle rows.",
  ],
  // The one sanctioned DOMAIN normal-workflow exception (audit §3): scoped,
  // in-transaction delete-then-reinsert of the week's attendance / health rows.
  [
    "leader_submit_group_checkin",
    "Normal-workflow exception (audit §3): scoped delete-then-reinsert of the " +
      "week's attendance_records / group_health_updates rows, in-transaction — " +
      "'replace the week', not data loss.",
  ],
]);

function baseName(qualified: string): string {
  return qualified.split(".").pop() ?? qualified;
}

describe("fitness: no hard deletes outside the danger zone (or the allowlist)", () => {
  it("finds migrations to scan (guards against a broken glob)", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it("every DELETE FROM lives in an allowlisted SECURITY DEFINER function", () => {
    const offenders = effectiveFunctions(MIGRATIONS)
      .filter((f) => deletesInBody(f.body))
      .filter((f) => !HARD_DELETE_ALLOWLIST.has(baseName(f.name)))
      .map((f) => `  ${f.signature}  (defined ${f.definedAt})`)
      .sort();

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These functions issue a DELETE FROM but are not allowlisted. A hard ` +
            `delete in a normal workflow violates the archive-by-default rule. ` +
            `Convert to a soft archive, move it to a Super-Admin danger-zone ` +
            `RPC, or — if it is a sanctioned exception — add it to ` +
            `HARD_DELETE_ALLOWLIST with a rationale:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("actually inspects deleting functions (sanity floor)", () => {
    // If the scan silently matched nothing the check above would pass vacuously.
    // The danger zone + the leader check-in guarantee a non-trivial delete set.
    const deleters = effectiveFunctions(MIGRATIONS).filter((f) =>
      deletesInBody(f.body)
    );
    expect(deleters.length).toBeGreaterThan(3);
  });

  it("every allowlist entry still corresponds to a deleting function (no stale exemptions)", () => {
    const deleterNames = new Set(
      effectiveFunctions(MIGRATIONS)
        .filter((f) => deletesInBody(f.body))
        .map((f) => baseName(f.name))
    );
    const stale = [...HARD_DELETE_ALLOWLIST.keys()].filter(
      (name) => !deleterNames.has(name)
    );
    expect(
      stale,
      stale.length === 0
        ? ""
        : `These HARD_DELETE_ALLOWLIST entries no longer match any deleting ` +
            `function — remove them:\n  ${stale.join("\n  ")}`
    ).toEqual([]);
  });
});
