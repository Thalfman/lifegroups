import { beforeAll, describe, expect, it } from "vitest";

import {
  assertAuditContentFree,
  assertExecuteLockdown,
  assertPairedAuditInsert,
  assertSecurityDefiner,
  functionBody,
  loadMigration,
  type MigrationSql,
} from "@/lib/admin/__tests__/migration-safety";

// Static boundary assertions over the Pivot slice 11 migration (#382 / ADR 0020).
// CI has no Postgres (RLS is verified manually per supabase/dev/README.md), so
// these substring/regex checks are the runnable regression guard for the
// security-critical invariants of the leader group-note write path:
//   * care_notes / prayer_requests widen to accept a GROUP subject (XOR a
//     profile subject) — exactly one is set.
//   * the ladder read gains an AUTHOR-grant arm so a leader's group note is
//     gated by THAT LEADER's transparency toggle (the leader is the author),
//     while the original SUBJECT-grant arm (OS notes about a leader) is kept.
//   * both leader write RPCs are SECURITY DEFINER, gate authorship on
//     auth_is_leader_of, write a paired content-free audit row (group_id +
//     has_body, never the body), and ship the EXECUTE lockdown.

const WRITE_RPCS = [
  {
    name: "leader_write_group_care_note",
    action: "'leader.care_note.write'",
  },
  {
    name: "leader_write_group_prayer_request",
    action: "'leader.prayer_request.write'",
  },
] as const;

let sql: MigrationSql;

beforeAll(() => {
  sql = loadMigration("20260608100000_phase_pivot11_leader_group_notes.sql");
});

describe("pivot11 leader group-notes migration — group subject", () => {
  it("adds a nullable subject_group_id to both notes tables", () => {
    expect(sql.lower).toContain(
      "alter table public.care_notes\n  add column if not exists subject_group_id uuid references public.groups(id) on delete cascade"
    );
    expect(sql.lower).toContain(
      "alter table public.prayer_requests\n  add column if not exists subject_group_id uuid references public.groups(id) on delete cascade"
    );
  });

  it("drops the NOT NULL on subject_profile_id (now optional)", () => {
    expect(sql.lower).toContain(
      "alter table public.care_notes\n  alter column subject_profile_id drop not null"
    );
    expect(sql.lower).toContain(
      "alter table public.prayer_requests\n  alter column subject_profile_id drop not null"
    );
  });

  it("enforces exactly one subject via a num_nonnulls XOR check on both tables", () => {
    expect(sql.lower).toContain("constraint care_notes_one_subject");
    expect(sql.lower).toContain("constraint prayer_requests_one_subject");
    // The XOR: exactly one of (subject_profile_id, subject_group_id) is set.
    const matches = [
      ...sql.lower.matchAll(
        /num_nonnulls\(subject_profile_id,\s*subject_group_id\)\s*=\s*1/g
      ),
    ];
    expect(matches.length).toBe(2);
  });
});

describe("pivot11 leader group-notes migration — ladder read keeps subject AND gains author grant", () => {
  // Slice the care_notes / prayer_requests SELECT policies out of the SQL so we
  // can assert both grant arms are present in each.
  function selectPolicy(table: string): string {
    const marker = `create policy ${table}_author_or_granted_select`;
    const start = sql.lower.indexOf(marker);
    expect(
      start,
      `${table} select policy should be (re)created`
    ).toBeGreaterThan(-1);
    const end = sql.lower.indexOf(");", start);
    return sql.lower.slice(start, end === -1 ? undefined : end);
  }

  for (const table of ["care_notes", "prayer_requests"] as const) {
    it(`${table}: author always reads their own row`, () => {
      expect(selectPolicy(table)).toContain(
        "author_profile_id = public.auth_profile_id()"
      );
    });

    it(`${table}: ladder peek requires auth_is_admin (super_admin gates on the same grant)`, () => {
      expect(selectPolicy(table)).toContain("public.auth_is_admin()");
    });

    it(`${table}: keeps the SUBJECT-grant arm (OS note about a leader)`, () => {
      expect(selectPolicy(table)).toContain(
        `g.subject_profile_id = ${table}.subject_profile_id`
      );
    });

    it(`${table}: adds the AUTHOR-grant arm (leader's group note)`, () => {
      expect(selectPolicy(table)).toContain(
        `g.subject_profile_id = ${table}.author_profile_id`
      );
    });

    it(`${table}: scopes the SUBJECT arm to profile-subject rows`, () => {
      expect(selectPolicy(table)).toContain(
        `${table}.subject_profile_id is not null`
      );
    });

    it(`${table}: scopes the AUTHOR arm to group-subject rows (no stale-grant cross-leak)`, () => {
      // Without this guard, a stale grant on a former leader (now over_shepherd)
      // would expose the profile-subject notes they author about OTHER leaders.
      expect(selectPolicy(table)).toContain(
        `${table}.subject_group_id is not null`
      );
    });

    it(`${table}: every grant arm requires the toggle to be ON (g.granted)`, () => {
      const policy = selectPolicy(table);
      const grantedChecks = [...policy.matchAll(/and g\.granted/g)];
      expect(grantedChecks.length).toBe(2);
    });
  }
});

describe("pivot11 leader group-notes migration — write RPCs", () => {
  it("does NOT add any write RLS policy (RPC-only writes)", () => {
    // No insert/update/delete policy is created on the notes tables here.
    expect(sql.lower).not.toMatch(/for\s+(insert|update|delete)/);
  });

  for (const { name, action } of WRITE_RPCS) {
    describe(name, () => {
      it("is SECURITY DEFINER with a pinned search_path", () => {
        assertSecurityDefiner(sql, name);
      });

      it("gates authorship on auth_is_leader_of (leader of the target group)", () => {
        const body = functionBody(sql, name);
        expect(body).toContain("public.auth_is_leader_of(p_group_id)");
        // Only leader/co_leader roles may author.
        expect(body).toContain("'leader'::public.user_role");
        expect(body).toContain("'co_leader'::public.user_role");
      });

      it("writes the row with a group subject (not a profile subject)", () => {
        const body = functionBody(sql, name);
        expect(body).toContain("subject_group_id");
        expect(body).not.toContain("subject_profile_id");
      });

      it("writes a paired audit row recording the action label", () => {
        assertPairedAuditInsert(sql, name, action);
      });

      it("ships the EXECUTE lockdown", () => {
        assertExecuteLockdown(sql, name, "uuid, text");
      });
    });
  }

  it("audit metadata is content-free: records group_id + has_body, never a body", () => {
    assertAuditContentFree(sql, {
      required: ["group_id", "has_body"],
      forbidden: ["p_body", "v_body"],
    });
  });
});
