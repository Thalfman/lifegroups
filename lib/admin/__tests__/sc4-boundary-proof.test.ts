import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  buildNoteAad,
  generateDek,
  encryptNote,
} from "@/lib/crypto/private-notes";

// SC.4 #114 — the consolidated adversarial boundary proof. Asserts, at every
// layer the repo's CI can exercise (no Postgres in CI; RLS is verified live per
// supabase/dev/README.md), that a private note is readable only by its creating
// ministry_admin. The cross-role matrix is proven by the RLS PREDICATE (it
// admits exactly one principal and excludes everyone else by construction); the
// app layer is proven by the no-leak exclusion scan
// (sc4-no-leak-exclusion.test.ts); the empirical live-DB matrix is the manual
// procedure documented in supabase/dev/README.md.

const NOTE_MIGRATION = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260529008000_phase_sc4_private_care_notes.sql",
    import.meta.url,
  ),
);
const LIFECYCLE_MIGRATION = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260529009000_phase_sc4_key_lifecycle.sql",
    import.meta.url,
  ),
);

const TABLES = ["shepherd_care_private_notes", "shepherd_care_note_key_slots"];
const NON_CREATOR_ROLES = ["super_admin", "over_shepherd", "staff_viewer", "leader", "co_leader"];

let noteSql = "";
let lifecycleSql = "";
const bothLower = () => `${noteSql}\n${lifecycleSql}`.toLowerCase();

// Extract the balanced-paren body of the first `<keyword> (...)` after `from`,
// collapsing whitespace. Used to read a policy's USING clause or a function's
// parameter list exactly, rather than just substring-matching it.
function balancedAfter(haystack: string, marker: string, from = 0): string {
  const at = haystack.indexOf(marker, from);
  if (at === -1) return "";
  let depth = 0;
  let begin = -1;
  for (let i = at; i < haystack.length; i += 1) {
    const ch = haystack[i];
    if (ch === "(") {
      if (depth === 0) begin = i + 1;
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return haystack.slice(begin, i).replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

// Slice every audit_events insert (across both migrations) up to the following
// `return`, so we can scan exactly what reaches audit metadata.
function auditInsertBlocks(): string[] {
  const haystack = bothLower();
  const blocks: string[] = [];
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
  noteSql = readFileSync(NOTE_MIGRATION, "utf8");
  lifecycleSql = readFileSync(LIFECYCLE_MIGRATION, "utf8");
});

  // The USING clause must be EXACTLY this — nothing OR'd on, no extra helper,
  // no extra role. Presence-only checks would pass a `OR public.is_admin()`
  // leak; an exact match cannot.
  const EXPECTED_USING =
    "public.auth_role() = 'ministry_admin'::public.user_role and created_by_profile_id = public.auth_profile_id()";

describe("SC.4 boundary — only the creating ministry_admin can read (RLS predicate)", () => {
  it("each table's SELECT policy is EXACTLY the creator predicate (sole gate)", () => {
    const policyChunks = noteSql.toLowerCase().split("create policy").slice(1);
    for (const table of TABLES) {
      const chunk = policyChunks.find((c) => c.includes(`on public.${table}`));
      expect(chunk, `${table} must have a SELECT policy`).toBeDefined();
      expect(chunk).toContain("for select to authenticated");
      // Exact USING body — any extra OR / helper / role would change this string.
      expect(balancedAfter(chunk as string, "using (")).toBe(EXPECTED_USING);
    }
  });

  it("admits no role via any helper, OR-branch, or named role literal", () => {
    // auth_is_admin() / auth_is_admin_or_staff() would admit super_admin; never use them.
    expect(noteSql.toLowerCase()).not.toContain("auth_is_admin");
    const policyChunks = noteSql.toLowerCase().split("create policy").slice(1);
    for (const chunk of policyChunks) {
      const using = balancedAfter(chunk, "using (");
      expect(using, "USING must have no OR branch").not.toMatch(/\bor\b/);
      // The only function calls allowed in USING are auth_role() and auth_profile_id().
      const calls = using.match(/public\.[a-z_]+\(/g) ?? [];
      for (const call of calls) {
        expect(["public.auth_role(", "public.auth_profile_id("]).toContain(call);
      }
      for (const role of NON_CREATOR_ROLES) {
        expect(using, `policy must not admit ${role}`).not.toContain(`'${role}'`);
      }
    }
  });

  it("adds no INSERT/UPDATE/DELETE policy and grants SELECT only (writes go through RPCs)", () => {
    expect(noteSql.toLowerCase()).not.toMatch(/for\s+insert/);
    expect(noteSql.toLowerCase()).not.toMatch(/for\s+update/);
    expect(noteSql.toLowerCase()).not.toMatch(/for\s+delete/);
    for (const table of TABLES) {
      expect(noteSql.toLowerCase()).toContain(`grant select on public.${table} to authenticated`);
    }
    expect(noteSql.toLowerCase()).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.shepherd_care_(private_notes|note_key_slots)/);
  });

  it("fences the key-slot table identically to the note table", () => {
    const policyChunks = noteSql.toLowerCase().split("create policy").slice(1);
    const notePolicy = policyChunks.find((c) => c.includes("on public.shepherd_care_private_notes"));
    const slotPolicy = policyChunks.find((c) => c.includes("on public.shepherd_care_note_key_slots"));
    for (const p of [notePolicy, slotPolicy]) {
      expect(p).toContain("auth_role() = 'ministry_admin'");
      expect(p).toContain("created_by_profile_id = public.auth_profile_id()");
    }
  });
});

describe("SC.4 boundary — every writer is a ministry_admin-only SECURITY DEFINER RPC", () => {
  it("all SC.4 write functions gate on the ministry_admin role and pin search_path", () => {
    const fns = [
      "admin_enroll_private_note_keys",
      "admin_upsert_shepherd_care_private_note",
      "admin_add_private_note_key_slot",
      "admin_rotate_private_note_recovery",
      "admin_remove_private_note_key_slot",
    ];
    const all = bothLower();
    for (const fn of fns) {
      const start = all.indexOf(`function public.${fn}`);
      expect(start, `${fn} must be defined`).toBeGreaterThan(-1);
      const body = all.slice(start, all.indexOf("$$;", start));
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = public, pg_temp");
      expect(body).toContain("auth_role() = 'ministry_admin'");
      // Per-function: the actor is derived from the session INSIDE this body...
      expect(body, `${fn} must derive the actor from the session`).toContain(
        "public.auth_profile_id()",
      );
      // ...and this function's parameter list carries no client-supplied creator.
      const params = balancedAfter(all, `function public.${fn}(`, start);
      expect(params, `${fn} must not accept a creator parameter`).not.toMatch(
        /p_(created_by|creator|actor|author|owner)/,
      );
    }
  });
});

describe("SC.4 boundary — audit is content-free", () => {
  it("audit metadata records presence/labels only, never body or key material", () => {
    const blocks = auditInsertBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(5); // one per SC.4 write RPC
    const joined = blocks.join("\n");
    for (const forbidden of [
      "ciphertext",
      "wrapped_dek",
      "prf_salt",
      "hkdf_salt",
      "wrap_iv",
      "recovery_code",
      "credential_id",
      "p_ciphertext",
      "p_slots",
      "p_wrapped_dek",
    ]) {
      expect(joined, `audit metadata must not contain ${forbidden}`).not.toContain(forbidden);
    }
    expect(joined).toContain("has_body");
  });
});

describe("SC.4 boundary — a stored row exposes ciphertext only, never plaintext", () => {
  it("the ciphertext table has no plaintext/body column", () => {
    const block = noteSql.slice(
      noteSql.indexOf("create table public.shepherd_care_private_notes"),
      noteSql.indexOf(");", noteSql.indexOf("create table public.shepherd_care_private_notes")),
    );
    expect(block).toMatch(/ciphertext\s+bytea\s+not null/i);
    expect(block).not.toMatch(/\btext\b/i);
    expect(block).not.toMatch(/\bbody\b/i);
  });

  it("the AES-256-GCM ciphertext of a known note does not contain the plaintext", async () => {
    const plaintext = "BOUNDARY-PROOF-KNOWN-PLAINTEXT-9c3f";
    const dek = await generateDek();
    const aad = buildNoteAad(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      1,
    );
    const { ciphertext } = await encryptNote(dek, plaintext, aad);
    const needle = new TextEncoder().encode(plaintext);
    const contains = (() => {
      outer: for (let i = 0; i + needle.length <= ciphertext.length; i += 1) {
        for (let j = 0; j < needle.length; j += 1) {
          if (ciphertext[i + j] !== needle[j]) continue outer;
        }
        return true;
      }
      return false;
    })();
    expect(contains).toBe(false);
  });
});
