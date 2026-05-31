import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Capacity & Multiplication #184: static boundary assertions over the migration
// that links a multiplication candidate to a leader_pipeline apprentice, seeds
// apprentices from existing successor_designate values, and enforces the
// same-group rule. CI has no Postgres, so this static guard stands in for the
// cross-group rejection test (the rule lives in the trigger + RPC SQL).

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260531110000_julian_cap2_candidate_apprentice_link.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("candidate ⇄ apprentice link migration — additive FK", () => {
  it("adds a nullable leader_pipeline_id FK with `add column if not exists`", () => {
    expect(lower()).toContain(
      "add column if not exists leader_pipeline_id uuid"
    );
    expect(lower()).toContain(
      "references public.leader_pipeline(id) on delete set null"
    );
  });

  it("never drops or NOT-NULLs the retained successor_designate", () => {
    expect(lower()).not.toMatch(
      /drop\s+column\s+(if\s+exists\s+)?successor_designate/
    );
    expect(lower()).not.toContain("successor_designate set not null");
  });
});

describe("candidate ⇄ apprentice link migration — same-group enforcement", () => {
  it("defines a DB-level BEFORE trigger that rejects a cross-group link", () => {
    expect(lower()).toContain(
      "create trigger multiplication_candidates_apprentice_same_group"
    );
    expect(lower()).toContain(
      "before insert or update on public.multiplication_candidates"
    );
    const fn = lower().slice(
      lower().indexOf("multiplication_candidate_apprentice_same_group")
    );
    expect(fn).toContain("apprentice_group_mismatch");
  });

  it("also guards same-group inside both create and update RPCs", () => {
    for (const name of [
      "admin_create_multiplication_candidate",
      "admin_update_multiplication_candidate",
    ]) {
      const fn = lower().slice(lower().indexOf(`function public.${name}`));
      expect(fn).toContain("apprentice_group_mismatch");
      expect(fn).toContain("missing_apprentice");
      // Both RPCs accept + persist the link param.
      expect(fn).toContain("p_leader_pipeline_id");
    }
  });

  it("re-creates both RPCs as SECURITY DEFINER with the link param and audited writes", () => {
    for (const name of [
      "admin_create_multiplication_candidate",
      "admin_update_multiplication_candidate",
    ]) {
      expect(lower()).toContain(`create or replace function public.${name}`);
      const fn = lower().slice(lower().indexOf(`function public.${name}`));
      expect(fn).toContain("security definer");
      expect(fn).toContain("set search_path = public, pg_temp");
      expect(fn).toContain("insert into public.audit_events");
      expect(fn).toContain("'has_apprentice_link'");
    }
  });
});

describe("candidate ⇄ apprentice link migration — successor seed", () => {
  it("seeds an apprentice from each candidate's successor_designate and links it", () => {
    // Insert into leader_pipeline from successor_designate, then link the
    // candidate via a CTE keyed by group_id (one active candidate per group).
    expect(lower()).toContain("insert into public.leader_pipeline");
    expect(lower()).toContain("btrim(c.successor_designate)");
    expect(lower()).toMatch(/set leader_pipeline_id = s\.id/);
    // Idempotent: only candidates with a successor name and no link yet.
    expect(lower()).toContain("c.leader_pipeline_id is null");
    expect(lower()).toContain("c.successor_designate is not null");
  });

  it("audits the seeded apprentice creation and the candidate link in the same transaction", () => {
    // The seed CTE ends in an audit_events insert covering both entities.
    expect(lower()).toContain("insert into public.audit_events");
    expect(lower()).toContain("'seeded_from_successor'");
    expect(lower()).toContain("'seeded_apprentice_link'");
  });

  it("does not service-role write or hard-delete", () => {
    expect(lower()).not.toContain("service_role");
    expect(lower()).not.toMatch(
      /delete\s+from\s+public\.multiplication_candidates/
    );
  });
});
