import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the SC.4 key-lifecycle migration (#113):
// add a passkey slot, rotate the recovery code, remove a slot. Same posture as
// the #112 migration: ministry_admin-only SECURITY DEFINER RPCs, actor-derived,
// content-free audit, EXECUTE lockdown. CI has no Postgres, so these guard the
// security-critical invariants.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260529009000_phase_sc4_key_lifecycle.sql",
    import.meta.url,
  ),
);

const FNS = [
  "admin_add_private_note_key_slot",
  "admin_rotate_private_note_recovery",
  "admin_remove_private_note_key_slot",
];

let sql = "";
const lower = () => sql.toLowerCase();

function fnBody(name: string): string {
  const start = lower().indexOf(`function public.${name}`);
  expect(start, `${name} should be defined`).toBeGreaterThan(-1);
  return lower().slice(start, lower().indexOf("$$;", start));
}

function auditBlocks(): string[] {
  const blocks: string[] = [];
  const haystack = lower();
  let from = 0;
  for (;;) {
    const start = haystack.indexOf("insert into public.audit_events", from);
    if (start === -1) break;
    const end = haystack.indexOf("return ", start);
    blocks.push(haystack.slice(start, end === -1 ? undefined : end));
    from = start + 1;
  }
  return blocks;
}

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("SC.4 key-lifecycle — RPCs are SECURITY DEFINER and ministry_admin-only", () => {
  it("defines all three lifecycle RPCs with a pinned search_path and the role gate", () => {
    for (const fn of FNS) {
      const body = fnBody(fn);
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = public, pg_temp");
      expect(body).toContain("auth_role() = 'ministry_admin'");
    }
  });

  it("never uses auth_is_admin() and never accepts created_by from the client", () => {
    expect(lower()).not.toContain("auth_is_admin");
    expect(lower()).not.toContain("p_created_by");
    expect(lower()).toContain("public.auth_profile_id()");
  });

  it("adds no RLS policies or write grants (writes flow only through these RPCs)", () => {
    expect(lower()).not.toMatch(/create policy/);
    expect(lower()).not.toMatch(/for\s+insert/);
    expect(lower()).not.toMatch(/grant\s+(insert|update|delete|select)/);
  });
});

describe("SC.4 key-lifecycle — slot rules", () => {
  it("add-slot only accepts passkey slots (recovery is rotated, not added)", () => {
    const body = fnBody("admin_add_private_note_key_slot");
    expect(body).toContain("passkey");
    // It must reject a recovery slot_type through this RPC.
    expect(body).toMatch(/slot_type[\s\S]*recovery|recovery[\s\S]*invalid_input/);
    expect(body).toContain("octet_length"); // byte-length validation
  });

  it("rotate deletes the existing recovery slot and inserts the replacement", () => {
    const body = fnBody("admin_rotate_private_note_recovery");
    expect(body).toMatch(/delete from public\.shepherd_care_note_key_slots/);
    expect(body).toContain("'recovery'");
    expect(body).toContain("octet_length");
  });

  it("remove refuses to delete the last remaining slot", () => {
    const body = fnBody("admin_remove_private_note_key_slot");
    expect(body).toContain("cannot_remove_last_slot");
  });
});

describe("SC.4 key-lifecycle — audit is content-free", () => {
  it("records presence/labels only, never key material", () => {
    const blocks = auditBlocks();
    expect(blocks.length).toBeGreaterThan(0);
    const joined = blocks.join("\n");
    for (const forbidden of [
      "wrapped_dek",
      "prf_salt",
      "hkdf_salt",
      "wrap_iv",
      "recovery_code",
      "p_wrapped_dek",
      "p_prf_salt",
    ]) {
      expect(joined, `audit must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("SC.4 key-lifecycle — EXECUTE lockdown", () => {
  it("revokes then grants execute to authenticated for each RPC", () => {
    for (const fn of FNS) {
      expect(lower()).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public`));
      expect(lower()).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon`));
      expect(lower()).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from authenticated`),
      );
      expect(lower()).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`),
      );
    }
  });
});
