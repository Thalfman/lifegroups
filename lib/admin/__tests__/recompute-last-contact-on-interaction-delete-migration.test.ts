import { beforeAll, describe, expect, it } from "vitest";

import {
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// ADR 0014 (SAD9 follow-up, PR #426 review): deleting a care interaction must
// not leave shepherd_care_profiles.last_contact_at pointing at a row that no
// longer exists. An AFTER DELETE trigger recomputes the high-water mark from the
// surviving interactions. CI has no Postgres, so this guards the migration as
// static substring assertions over the SQL text.

const FN = "shepherd_care_recompute_last_contact_on_interaction_delete";

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration(
    "20260621010000_phase_sad9_recompute_last_contact_on_interaction_delete.sql"
  );
});

describe("SAD9 last_contact_at recompute trigger", () => {
  it("recomputes last_contact_at from max(interaction_at) of survivors", () => {
    const body = functionBody(sql, FN);
    expect(body).toContain("update public.shepherd_care_profiles");
    expect(body).toContain("last_contact_at");
    expect(body).toContain("max(i.interaction_at)");
    expect(body).toContain("from public.shepherd_care_interactions i");
    expect(body).toContain("where i.care_profile_id = old.care_profile_id");
  });

  it("excludes over-shepherd broad notes from the recompute (audit-identified)", () => {
    const body = functionBody(sql, FN);
    // Broad notes never advance the clock on insert, so they must not be counted
    // as contact on recompute either. They carry no row-level flag, so the
    // exclusion is keyed on their immutable audit_events row.
    expect(body).toContain("not exists");
    expect(body).toContain("from public.audit_events ae");
    expect(body).toContain("ae.entity_type = 'shepherd_care_interactions'");
    expect(body).toContain("ae.action = 'over_shepherd.log_broad_note'");
  });

  it("runs SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, FN);
  });

  it("locks out direct calls (revokes execute from public/anon/authenticated)", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(sql.lower).toContain(
        `revoke all on function public.${FN}() from ${role};`
      );
    }
  });

  it("fires AFTER DELETE on shepherd_care_interactions, per row", () => {
    expect(sql.lower).toContain(
      "after delete on public.shepherd_care_interactions"
    );
    expect(sql.lower).toContain("for each row");
    expect(sql.lower).toContain(`execute function public.${FN}()`);
  });

  it("does not advance the clock on insert/update — delete only", () => {
    // The trigger must be a delete recompute, never an insert/update path that
    // could fight admin_log_shepherd_care_interaction's greatest(...) advance.
    expect(sql.lower).not.toContain("before insert");
    expect(sql.lower).not.toContain("after insert");
    expect(sql.lower).not.toContain("after update");
  });
});
