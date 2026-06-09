import { describe, expect, it } from "vitest";

import {
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Regression guard for the production-only `DELETE requires a WHERE clause`
// failure: the Supabase Data API role (`authenticator`) preloads the
// `safeupdate` library, which rejects any UPDATE/DELETE without a WHERE clause —
// including inside a SECURITY DEFINER body. The Danger-Zone "reset" RPCs cleared
// whole tables with bare `delete from <table>;`, so every one threw when called
// through the API (mapped to the generic error). CI has no Postgres and
// safeupdate is not loaded for the migration role, so only this static guard
// catches a regression: no fixed function body may contain a bare, unqualified
// table delete.

const sql: MigrationSql = loadMigration(
  "20260627000000_fix_safeupdate_unqualified_deletes.sql"
);

// A bare `delete from public.<table>;` — a table delete terminated by `;` with
// no intervening WHERE. The fix replaces every one of these with `where true`.
const BARE_DELETE = /delete\s+from\s+public\.\w+\s*;/;

const FIXED_FUNCTIONS = [
  "super_admin_clean_slate_wipe",
  "super_admin_launch_prep",
  "super_admin_reset_history_category",
  "super_admin_reset_audit_logs",
] as const;

describe("safeupdate fix — no unqualified deletes in the reset RPCs", () => {
  it("the migration file contains no bare unqualified table delete", () => {
    expect(sql.lower).not.toMatch(BARE_DELETE);
  });

  for (const fn of FIXED_FUNCTIONS) {
    describe(fn, () => {
      it("body has no bare unqualified delete (every delete carries a WHERE)", () => {
        expect(functionBody(sql, fn)).not.toMatch(BARE_DELETE);
      });

      it("still wipes via an explicit `where true`", () => {
        expect(functionBody(sql, fn)).toContain("where true");
      });

      it("stays SECURITY DEFINER with a pinned search_path", () => {
        assertSecurityDefiner(sql, fn);
      });
    });
  }
});
