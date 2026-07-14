import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { normalizeTextForStaticAssertions } from "./migration-safety";

// Static assertions over the reviewer/demo seed (#572). CI has no Postgres, so
// these guard the invariants the seed must uphold: idempotent, fully synthetic,
// and respectful of the write guardrails (data only — no policies, no
// service-role, no RLS changes, no hard deletes).

const SEED_PATH = fileURLToPath(
  new URL("../../../supabase/seed/reviewer_demo_seed.sql", import.meta.url)
);
const raw = normalizeTextForStaticAssertions(readFileSync(SEED_PATH, "utf8"));
const lower = raw.toLowerCase();

describe("reviewer demo seed — idempotency", () => {
  it("guards every insert (ON CONFLICT / NOT EXISTS)", () => {
    expect(lower).toContain("on conflict");
    expect(lower).toContain("not exists");
  });

  it("has no explicit transaction wrapper (matches the sibling seeds)", () => {
    // An unwrapped file is safe to feed to a runner that opens its own
    // transaction; the sibling seeds (phase2_seed / multiplication_seed) follow
    // the same convention.
    expect(lower).not.toContain("begin;");
    expect(lower).not.toContain("commit;");
  });
});

describe("reviewer demo seed — fully synthetic", () => {
  it("uses only @reviewerdemo.example email addresses", () => {
    const emails = raw.match(/[\w.+-]+@[\w.-]+\.[\w.-]+/g) ?? [];
    expect(emails.length, "seed should contain demo emails").toBeGreaterThan(0);
    const foreign = emails.filter(
      (e) => !e.toLowerCase().endsWith("@reviewerdemo.example")
    );
    expect(
      foreign,
      "every email must be a synthetic @reviewerdemo.example"
    ).toEqual([]);
  });

  it("carries an obvious synthetic marker", () => {
    expect(lower).toContain("synthetic reviewer demo data");
  });
});

describe("reviewer demo seed — respects the write guardrails", () => {
  it("is data-only: no policies, RLS, service-role, or SECURITY DEFINER", () => {
    for (const forbidden of [
      "create policy",
      "enable row level security",
      "service_role",
      "security definer",
      "grant ",
      "alter table",
    ]) {
      expect(lower, `seed must not contain "${forbidden}"`).not.toContain(
        forbidden
      );
    }
  });

  it("performs no hard deletes or drops", () => {
    expect(lower).not.toContain("delete from");
    expect(lower).not.toMatch(/\bdrop\s+/);
  });
});

describe("reviewer demo seed — covers every role surface", () => {
  it("populates the Group Type, Group, People, Leader, Over-Shepherd, and care tables", () => {
    for (const table of [
      "public.group_type_configs",
      "public.groups",
      "public.profiles",
      "public.group_leaders",
      "public.members",
      "public.group_memberships",
      "public.over_shepherds",
      "public.shepherd_coverage_assignments",
      "public.care_notes",
      "public.prayer_requests",
    ]) {
      expect(lower, `seed should insert into ${table}`).toContain(
        `insert into ${table}`
      );
    }
  });

  it("writes both arms of the one-subject care note / prayer request model", () => {
    // A leader note about a group, and an over-shepherd note about a leader.
    expect(lower).toContain("subject_group_id");
    expect(lower).toContain("subject_profile_id");
  });
});
