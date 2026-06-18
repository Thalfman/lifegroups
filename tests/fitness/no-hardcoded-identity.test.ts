import { describe, expect, it } from "vitest";

import { readSourceFiles, stripComments } from "./support/source-globber";
import {
  formatMatches,
  scanLines,
  stripFiles,
  stripSqlComments,
  TEST_FILE_EXCLUDES,
} from "./support/scan";

// P0 invariant: authorization is role-based. No Julian/Tom UUIDs or emails are
// hardcoded in authorization code or RLS — gate on `profiles.role`. This scan
// covers the two places identity could leak into an auth decision:
//   1. `lib/auth/**` runtime code (session/role helpers).
//   2. RLS policy migrations under `supabase/migrations/**`.
//
// Comments are stripped from BOTH (TS via stripComments, SQL via
// stripSqlComments) so an illustrative literal in a comment — `// e.g.
// julian@church.org` or migrations explaining case-insensitive email handling
// with 'Alice@x.com' — never trips it. String contents are KEPT, since a
// hardcoded email/UUID in a string IS the violation. Colocated tests are
// excluded (they use fixture UUID/email constants by design).

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const UUID =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;

describe("fitness: no hardcoded identity in authorization code", () => {
  it("lib/auth/** never hardcodes an email or UUID literal", () => {
    const files = stripFiles(
      readSourceFiles({
        roots: ["lib/auth"],
        extensions: [".ts", ".tsx"],
        exclude: [...TEST_FILE_EXCLUDES],
      }),
      stripComments
    );
    const hits = [...scanLines(files, EMAIL), ...scanLines(files, UUID)];
    expect(
      hits,
      hits.length === 0
        ? ""
        : `Authorization must gate on profiles.role, not a hardcoded ` +
            `identity:\n${formatMatches(hits)}`
    ).toEqual([]);
  });

  it("migrations never hardcode an email or UUID literal", () => {
    // Scan ALL migrations, not just policy DDL: a SECURITY DEFINER auth helper
    // (e.g. auth_is_admin_or_staff in 20260531140000_remove_staff_viewer_role)
    // gates every policy that calls it, so a hardcoded identity there controls
    // authorization without any create/alter policy line. Strip SQL comments so
    // illustrative literals in comments don't trip it.
    const stripped = readSourceFiles({
      roots: ["supabase/migrations"],
      extensions: [".sql"],
    }).map((f) => ({
      ...f,
      text: stripSqlComments(f.text),
    }));

    const hits = [...scanLines(stripped, EMAIL), ...scanLines(stripped, UUID)];
    expect(
      hits,
      hits.length === 0
        ? ""
        : `RLS policies must gate on profiles.role, not a hardcoded ` +
            `identity:\n${formatMatches(hits)}`
    ).toEqual([]);
  });
});
