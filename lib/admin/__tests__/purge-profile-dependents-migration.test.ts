import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "./migration-safety";

// Issue #880: static boundary assertions over the per-dependent FK strategies
// that make a profile purgeable when it was an active Leader, a covered
// shepherd, and a Care Note + Prayer Request author. Pinned decisions:
// authored notes/prayers are RETAINED with anonymized authorship (FK set null
// + 'Former Shepherd' descriptor, deliberately NO personal identifiers);
// operational assignment rows are captured onto the tombstone
// (cleanup_snapshot) then deleted pre-purge; every purge invariant (Super-
// Admin-only, paired audit row, tombstone, one transaction) is preserved.

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260715000000_purge_profile_dependent_strategies.sql");
});

describe("#880 — authorship FKs re-pointed to ON DELETE SET NULL", () => {
  it.each(["care_notes", "prayer_requests"])(
    "%s.author_profile_id drops NOT NULL and re-adds the FK as set null",
    (table) => {
      expect(sql.lower).toContain(
        `alter table public.${table}\n  alter column author_profile_id drop not null`
      );
      expect(sql.lower).toContain(
        `drop constraint if exists ${table}_author_profile_id_fkey`
      );
      const readd = sql.lower.slice(
        sql.lower.indexOf(`add constraint ${table}_author_profile_id_fkey`)
      );
      expect(readd).toContain("references public.profiles(id)");
      expect(readd.slice(0, 300)).toContain("on delete set null");
    }
  );

  it.each(["care_notes", "prayer_requests"])(
    "adds the nullable %s.author_descriptor column with no default",
    (table) => {
      expect(sql.lower).toContain(
        `alter table public.${table}\n  add column if not exists author_descriptor text`
      );
      // No default and no not-null: the descriptor is stamped only by the
      // purge engine, never auto-populated on ordinary writes.
      expect(sql.lower).not.toContain("author_descriptor text not null");
      expect(sql.lower).not.toContain("author_descriptor text default");
    }
  );
});

describe("#880 — tombstone cleanup_snapshot column", () => {
  it("adds tombstones.cleanup_snapshot (jsonb, defaulted empty array)", () => {
    expect(sql.lower).toContain(
      "alter table public.tombstones\n  add column if not exists cleanup_snapshot jsonb not null default '[]'::jsonb"
    );
  });

  it("leaves super_admin_restore_tombstone untouched (restore never resurrects cleanup rows)", () => {
    expect(sql.lower).not.toContain(
      "function public.super_admin_restore_tombstone"
    );
  });
});

describe("#880 — confidential block keeps subject arms, drops author arms", () => {
  it("preserves the SC.4 private-note arm and both SUBJECT arms", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("shepherd_care_private_notes");
    expect(body).toContain("shepherd_care_profiles");
    expect(body).toContain("subject_profile_id = p_id");
    expect(body).toContain("subject_group_id = p_id");
    expect(body).toContain("from public.care_notes");
    expect(body).toContain("from public.prayer_requests");
  });

  it("no longer blocks a profile for notes it merely AUTHORED (they are retained anonymized)", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).not.toContain("author_profile_id = p_id");
  });

  it("stays existence-only (no content read) and an internal helper (no EXECUTE grant)", () => {
    const body = functionBody(sql, "super_admin_confidential_block");
    expect(body).toContain("exists (");
    expect(body).not.toContain(".body");
    expect(body).not.toContain("ciphertext");
    expect(sql.lower).toContain(
      "revoke all on function public.super_admin_confidential_block(text, uuid) from authenticated"
    );
    expect(sql.lower).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.super_admin_confidential_block/
    );
  });

  it("pins an injection-safe search_path on the helper", () => {
    expect(functionBody(sql, "super_admin_confidential_block")).toContain(
      "set search_path = public, pg_temp"
    );
  });
});

describe("#880 — super_admin_permanent_delete profile pre-step", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_permanent_delete");
  });

  it("keeps every prior guard: role gate, forbidden super_admin target, confidential block, blocker refusal", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("auth_role() <> 'super_admin'");
    expect(body).toContain("raise exception 'insufficient_privilege'");
    expect(body).toContain("role = 'super_admin'");
    expect(body).toContain("raise exception 'forbidden_target'");
    expect(body).toContain("raise exception 'has_confidential_records'");
    expect(body).toContain("raise exception 'has_blocking_dependents'");
    expect(body).toContain("raise exception 'missing_entity'");
    expect(body).not.toContain("auth.users");
  });

  it("stamps the anonymized descriptor on BOTH retained note kinds — never a name", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("update public.care_notes");
    expect(body).toContain("update public.prayer_requests");
    const stamps = body
      .split("author_descriptor = ")
      .slice(1)
      .map((s) => s.slice(0, 20));
    expect(stamps).toHaveLength(2);
    for (const stamp of stamps) {
      expect(stamp).toContain("'former shepherd'");
    }
    // Anonymized means anonymized: the stamp never copies profile identity.
    expect(body).not.toContain("full_name");
  });

  it("locks the care-profile row FOR UPDATE before the confidential check (TOCTOU guard)", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    // The lock statement itself: the target's care-profile row, FOR UPDATE.
    // A child FK insert takes FOR KEY SHARE on that parent row, which
    // conflicts with FOR UPDATE — so no care-profile child (admin note,
    // follow-up, SC.4 private note) can appear between the confidential
    // check, the captures, and the cascade-firing delete.
    expect(body).toMatch(
      /perform 1\s+from public\.shepherd_care_profiles\s+where shepherd_profile_id = p_id\s+for update/
    );
    // Ordering is load-bearing: lock -> confidential check -> stamps/captures.
    const lockIdx = body.indexOf("perform 1");
    const confidentialIdx = body.indexOf("super_admin_confidential_block");
    const stampIdx = body.indexOf("update public.care_notes");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(confidentialIdx).toBeGreaterThan(lockIdx);
    expect(stampIdx).toBeGreaterThan(confidentialIdx);
  });

  it("cleans up each operational assignment table atomically (DELETE … RETURNING captures)", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    for (const [table, column] of [
      ["group_leaders", "profile_id"],
      ["shepherd_coverage_assignments", "shepherd_profile_id"],
      ["shepherd_care_profiles", "shepherd_profile_id"],
    ] as const) {
      // One statement per table: the delete IS the capture (RETURNING), so
      // the tombstone snapshot can never diverge from what was removed.
      expect(body).toMatch(
        new RegExp(
          `delete from public\\.${table}\\s+where ${column} = p_id\\s+returning \\*`
        )
      );
      // Named in the cleanup_snapshot entries.
      expect(body).toContain(`'${table}'`);
    }
    // The captured rows come from the deleting CTE, not a separate read.
    expect(body).toContain("jsonb_agg(to_jsonb(d))");
    // A restrict-linked care-profile child still refuses the purge with the
    // engine's established token, not a raw FK error.
    expect(body).toContain("when foreign_key_violation then");
  });

  it("captures the care-profile CASCADE children before the delete (no unsnapshotted cascade)", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    // shepherd_care_admin_notes (holds admin_summary) and
    // shepherd_care_follow_ups cascade off the care-profile delete — both are
    // snapshotted into v_cleanup via the care-profile join, BEFORE the delete.
    for (const table of [
      "shepherd_care_admin_notes",
      "shepherd_care_follow_ups",
    ]) {
      expect(body).toContain(`from public.${table} t`);
      expect(body).toContain(`'${table}'`);
      // Captured, never deleted directly: the cascade does the removal.
      expect(body).not.toContain(`delete from public.${table}`);
    }
    expect(body).toContain("join public.shepherd_care_profiles cp");
    expect(body).toContain("cp.shepherd_profile_id = p_id");
    // Both captures happen before the care-profile delete fires the cascade.
    const captureIdx = body.indexOf("from public.shepherd_care_admin_notes t");
    const followUpIdx = body.indexOf("from public.shepherd_care_follow_ups t");
    const deleteIdx = body.indexOf("delete from public.shepherd_care_profiles");
    expect(captureIdx).toBeGreaterThan(-1);
    expect(followUpIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(captureIdx);
    expect(deleteIdx).toBeGreaterThan(followUpIdx);
    // The unreachable-cascade rationale stays documented in the body: private
    // notes are refused by the SC.4 confidential arm before this pre-step.
    expect(body).toContain("shepherd_care_private_notes");
  });

  it("runs the pre-step AFTER the target snapshot and BEFORE the dependent collector", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    const snapshotIdx = body.indexOf("select to_jsonb(t) from public.%i");
    const stampIdx = body.indexOf("update public.care_notes");
    const cleanupIdx = body.indexOf("delete from public.group_leaders");
    const collectIdx = body.indexOf("super_admin_collect_dependents");
    expect(snapshotIdx).toBeGreaterThan(-1);
    expect(stampIdx).toBeGreaterThan(snapshotIdx);
    expect(cleanupIdx).toBeGreaterThan(stampIdx);
    expect(collectIdx).toBeGreaterThan(cleanupIdx);
  });

  it("gates the pre-step to profile targets only", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    const preStep = body.slice(
      body.indexOf("raise exception 'missing_entity'"),
      body.indexOf("update public.care_notes")
    );
    expect(preStep).toContain("if p_entity_type = 'profile' then");
  });

  it("writes the cleanup snapshots onto the tombstone in the same insert", () => {
    const body = functionBody(sql, "super_admin_permanent_delete");
    const tombstoneInsert = body.slice(
      body.indexOf("insert into public.tombstones")
    );
    expect(tombstoneInsert).toContain("cleanup_snapshot");
    expect(tombstoneInsert).toContain("set_null_dependents");
    expect(tombstoneInsert).toContain("row_snapshot");
    expect(tombstoneInsert).toContain("v_cleanup");
  });

  it("writes one paired audit_events row in the same transaction", () => {
    assertPairedAuditInsert(
      sql,
      "super_admin_permanent_delete",
      "'super_admin.permanent_delete'"
    );
  });

  it("audit metadata stays content-free: counts + ids, never a body or a name", () => {
    // The insert itself carries only the assembled v_metadata variable…
    assertAuditContentFree(sql, {
      forbidden: ["'body'", "v_body", "full_name", "actor_email", "v_row"],
      required: ["v_metadata"],
    });
    // …and that variable is built exclusively from ids and counts.
    const body = functionBody(sql, "super_admin_permanent_delete");
    expect(body).toContain("'tombstone_id', v_tombstone_id");
    expect(body).toContain("anonymized_care_note_count");
    expect(body).toContain("anonymized_prayer_request_count");
    expect(body).toContain("cleaned_group_leader_count");
    expect(body).toContain("captured_care_admin_note_count");
    expect(body).toContain("captured_care_follow_up_count");
    // The captured row snapshots (v_cleanup) go to the tombstone, never to
    // audit metadata.
    const metadataAssignments = body.split("v_metadata :=").slice(1).join("\n");
    expect(metadataAssignments).not.toContain("v_cleanup");
    expect(metadataAssignments).not.toContain("v_row");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "super_admin_permanent_delete", "text, uuid");
  });
});

describe("#880 — preflight mirrors the engine's profile pre-step", () => {
  it("is SECURITY DEFINER + stable with a pinned search_path", () => {
    assertSecurityDefiner(sql, "super_admin_permanent_delete_preflight");
    expect(
      functionBody(sql, "super_admin_permanent_delete_preflight")
    ).toContain("stable");
  });

  it("keeps the role gate, forbidden super_admin target, and confidential short-circuits", () => {
    const body = functionBody(sql, "super_admin_permanent_delete_preflight");
    expect(body).toContain("auth_role() <> 'super_admin'");
    expect(body).toContain("raise exception 'insufficient_privilege'");
    expect(body).toContain("role = 'super_admin'");
    expect(body).toContain("'forbidden', true");
    expect(body).toContain("super_admin_confidential_block");
    expect(body).toContain("'confidential', true");
  });

  it("moves exactly the engine's three cleanup tables out of blockers, for profile targets only", () => {
    const body = functionBody(sql, "super_admin_permanent_delete_preflight");
    expect(body).toContain("if p_entity_type = 'profile'");
    expect(body).toContain("'group_leaders'");
    expect(body).toContain("'profile_id'");
    expect(body).toContain("'shepherd_coverage_assignments'");
    expect(body).toContain("'shepherd_care_profiles'");
    expect(body).toContain("'shepherd_profile_id'");
    // The bucketed entries land in cleanup; everything else stays a blocker.
    expect(body).toContain("v_cleanup :=");
    expect(body).toContain("v_remaining :=");
    expect(body).toContain("'cleanup', v_cleanup");
  });

  it("computes deletable from the REMAINING blockers only, keeping response keys compatible", () => {
    const body = functionBody(sql, "super_admin_permanent_delete_preflight");
    expect(body).toContain("'deletable', jsonb_array_length(v_remaining) = 0");
    expect(body).toContain("'blockers', v_remaining");
    expect(body).toContain("'set_null', v_set_null");
  });

  it("also announces the care-profile cascade children in the cleanup bucket (join counts)", () => {
    const body = functionBody(sql, "super_admin_permanent_delete_preflight");
    expect(body).toContain("'shepherd_care_admin_notes'");
    expect(body).toContain("'shepherd_care_follow_ups'");
    expect(body).toContain("'care_profile_id'");
    expect(body).toContain("join public.shepherd_care_profiles cp");
    expect(body).toContain("cp.shepherd_profile_id = p_id");
    // Count-only preview: the preflight never reads the child rows themselves.
    expect(body).not.toContain("jsonb_agg(to_jsonb(t))");
  });

  it("stays a pure read: no DML, no audit row", () => {
    const body = functionBody(sql, "super_admin_permanent_delete_preflight");
    expect(body).not.toContain("delete from");
    expect(body).not.toContain("update public.");
    expect(body).not.toContain("insert into");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(
      sql,
      "super_admin_permanent_delete_preflight",
      "text, uuid"
    );
  });
});

describe("#880 — sealed-note counts survive a purged author", () => {
  it("keeps the definer + pinned search_path + admin gate posture", () => {
    assertSecurityDefiner(sql, "admin_sealed_note_counts");
    const body = functionBody(sql, "admin_sealed_note_counts");
    expect(body).toContain("auth_is_admin()");
    expect(body).toContain("raise exception 'insufficient_privilege'");
  });

  it("uses a null-safe author comparison so a purged author's rows stay counted", () => {
    const body = functionBody(sql, "admin_sealed_note_counts");
    expect(body).toContain("author_profile_id is distinct from v_actor");
    // The null-hostile form must be gone from BOTH arms.
    expect(body).not.toContain("author_profile_id <> v_actor");
  });

  it("excludes rows with no gating leader left instead of emitting a NULL gating row", () => {
    const body = functionBody(sql, "admin_sealed_note_counts");
    const exclusions = body.match(
      /coalesce\(\w\.subject_profile_id, \w\.author_profile_id\) is not null/g
    );
    // Once per arm (care_notes + prayer_requests).
    expect(exclusions).toHaveLength(2);
  });

  it("stays a counts-only read: no bodies, no DML, no audit row", () => {
    const body = functionBody(sql, "admin_sealed_note_counts");
    expect(body).not.toContain(".body");
    expect(body).not.toContain("delete from");
    expect(body).not.toContain("update public.");
    expect(body).not.toContain("insert into");
  });

  it("locks EXECUTE down to authenticated only", () => {
    assertExecuteLockdown(sql, "admin_sealed_note_counts");
  });
});

describe("#880 — deliberately untouched surfaces", () => {
  it("does not register care_notes / prayer_requests as deletable targets", () => {
    expect(sql.lower).not.toContain(
      "function public.super_admin_deletable_table"
    );
  });

  it("changes no RLS policy text (the visibility divergence pin stays valid)", () => {
    expect(sql.lower).not.toContain("create policy");
    expect(sql.lower).not.toContain("drop policy");
  });
});
