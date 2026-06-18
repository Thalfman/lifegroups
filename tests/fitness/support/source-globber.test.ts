import { describe, expect, it } from "vitest";

import {
  listSourceFiles,
  stripComments,
  stripCommentsAndStrings,
} from "./source-globber";

// Regression tests for the fitness source-scan support — the detectors are only
// as trustworthy as these primitives. Each case pins a bug the scans depend on
// NOT having (PR #702 review): file roots must be scanned, regex literals must
// not flip the scanner into string mode, and comment-vs-string stripping must be
// selectable.

describe("listSourceFiles", () => {
  it("scans file roots, not just directories (e.g. proxy.ts)", () => {
    const files = listSourceFiles({
      roots: ["proxy.ts"],
      extensions: [".ts"],
    });
    expect(files).toContain("proxy.ts");
  });

  it("walks directory roots", () => {
    const files = listSourceFiles({
      roots: ["lib/nav"],
      extensions: [".ts"],
      exclude: ["/__tests__/"],
    });
    expect(files).toContain("lib/nav/route-registry.ts");
  });
});

describe("stripCommentsAndStrings (regex awareness)", () => {
  it("blanks a regex literal containing a quote without entering string mode", () => {
    // The real shape from lib/supabase/follow-up-reads.ts / multiplication-seed.ts.
    const src = `const re = /["(),]/;\nawait client.from("t").insert({ a: 1 });`;
    const out = stripCommentsAndStrings(src);
    // The trailing real code must survive (not be swallowed as a "string").
    expect(out).toContain(".from(");
    expect(out).toContain(".insert(");
    // The quote inside the regex must NOT leak through as code.
    expect(out).not.toContain('"(),"');
  });

  it("handles a regex after .replace( with a quote", () => {
    const src = `const q = value.replace(/'/g, "''");\nx.from("t").update({});`;
    const out = stripCommentsAndStrings(src);
    expect(out).toContain(".update(");
  });

  it("still blanks ordinary string literals", () => {
    const out = stripCommentsAndStrings(`const t = "secret-table";`);
    expect(out).not.toContain("secret-table");
  });

  it("does not treat division as a regex", () => {
    const out = stripCommentsAndStrings(`const r = a / b; const s = "keep?";`);
    expect(out).toContain("a / b");
  });
});

describe("stripComments (keeps strings, drops comments)", () => {
  it("removes a line comment but keeps a string literal", () => {
    const out = stripComments(
      `const x = "admin@example.com"; // e.g. real@person.org`
    );
    expect(out).toContain("admin@example.com");
    expect(out).not.toContain("real@person.org");
  });

  it("does not treat // inside a string as a comment", () => {
    const out = stripComments(`const url = "http://example.com/path";`);
    expect(out).toContain("http://example.com/path");
  });
});
