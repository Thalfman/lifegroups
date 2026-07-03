import { describe, expect, it } from "vitest";

import type { SourceFile } from "../source-globber";
import {
  extractRevalidateFingerprints,
  indexTopLevelDeclarations,
  renderMapEntries,
  revalidateValueExtent,
} from "../revalidate-targets";

function file(relPath: string, text: string): SourceFile {
  return { relPath, absPath: `/repo/${relPath}`, text };
}

describe("revalidateValueExtent", () => {
  it("ends at the first comma at depth 0", () => {
    const text = `revalidate: (value) => ["/admin", "/admin/plan"],\n  next: 1`;
    const start = "revalidate:".length;
    expect(revalidateValueExtent(text, start)).toBe(
      ` (value) => ["/admin", "/admin/plan"]`
    );
  });

  it("ends at the spec object's closing brace when it is the last property", () => {
    const text = `revalidate: () => ["/admin"] };`;
    expect(revalidateValueExtent(text, "revalidate:".length)).toBe(
      ` () => ["/admin"] `
    );
  });

  it("ignores commas and braces inside strings and template expressions", () => {
    const text =
      'revalidate: (v) => [`/a/${v.x ? v.y : v.z}`, "/b,c", { path: "/d", type: "page" }],';
    const extent = revalidateValueExtent(text, "revalidate:".length);
    expect(extent).toContain('"/b,c"');
    expect(extent).toContain('type: "page" }');
  });
});

describe("indexTopLevelDeclarations", () => {
  it("maps column-0 const and function declarations to their segments", () => {
    const text = [
      `const PATHS = ["/admin"];`,
      ``,
      `export async function act() {`,
      `  const inner = 1;`,
      `}`,
      ``,
      `function helper(id) {`,
      `  return ["/x", id];`,
      `}`,
    ].join("\n");
    const index = indexTopLevelDeclarations(text);
    expect([...index.keys()].sort()).toEqual(["PATHS", "act", "helper"]);
    expect(index.get("helper")).toContain(`"/x"`);
    expect(index.has("inner")).toBe(false);
  });
});

describe("extractRevalidateFingerprints", () => {
  it("harvests literal arrays and normalizes template interpolations", () => {
    const { entries, errors } = extractRevalidateFingerprints([
      file(
        "app/x/actions.ts",
        [
          `const SPEC = {`,
          `  name: "admin.x.create",`,
          `  revalidate: (value) => ["/admin", \`/admin/x/\${value.id}\`],`,
          `};`,
        ].join("\n")
      ),
    ]);
    expect(errors).toEqual([]);
    expect(entries["admin.x.create"]).toEqual(["/admin", "/admin/x/${*}"]);
  });

  it("resolves same-file helpers and consts transitively", () => {
    const { entries, errors } = extractRevalidateFingerprints([
      file(
        "app/x/actions.ts",
        [
          `const DETAIL = \`/admin/x/\${"never"}\`;`,
          ``,
          `function paths(id) {`,
          `  return ["/admin/x", ...(id ? [DETAIL] : [])];`,
          `}`,
          ``,
          `const SPEC = {`,
          `  name: "admin.x.update",`,
          `  revalidate: (value) => paths(value.id),`,
          `};`,
        ].join("\n")
      ),
    ]);
    expect(errors).toEqual([]);
    expect(entries["admin.x.update"]).toEqual(["/admin/x", "/admin/x/${*}"]);
  });

  it("renders typed { path, type } targets with a type prefix, not doubled", () => {
    const { entries, errors } = extractRevalidateFingerprints([
      file(
        "app/x/actions.ts",
        [
          `const WILDCARD = {`,
          `  path: "/admin/x/[id]",`,
          `  type: "page",`,
          `} as const;`,
          ``,
          `const SPEC = {`,
          `  name: "admin.x.archive",`,
          `  revalidate: () => ["/admin/x", WILDCARD],`,
          `};`,
        ].join("\n")
      ),
    ]);
    expect(errors).toEqual([]);
    expect(entries["admin.x.archive"]).toEqual([
      "/admin/x",
      "page:/admin/x/[id]",
    ]);
  });

  it("keys hand-rolled revalidatePath callers as file:<path>#direct", () => {
    const { entries, errors } = extractRevalidateFingerprints([
      file(
        "app/y/actions.ts",
        [
          `const REVALIDATE_PATHS = ["/admin", "/admin/people"];`,
          ``,
          `export async function act() {`,
          `  for (const path of REVALIDATE_PATHS) revalidatePath(path);`,
          `  revalidatePath("/", "layout");`,
          `}`,
        ].join("\n")
      ),
    ]);
    expect(errors).toEqual([]);
    expect(entries["file:app/y/actions.ts#direct"]).toEqual([
      "/admin",
      "/admin/people",
      "layout:/",
    ]);
  });

  it("errors on an empty fingerprint instead of pinning []", () => {
    const { entries, errors } = extractRevalidateFingerprints([
      file(
        "app/z/actions.ts",
        [
          `const SPEC = {`,
          `  name: "admin.z.create",`,
          `  revalidate: (value) => importedHelper(value.id),`,
          `};`,
        ].join("\n")
      ),
    ]);
    expect(entries["admin.z.create"]).toBeUndefined();
    expect(errors.some((e) => e.includes("admin.z.create"))).toBe(true);
  });

  it("errors when name/revalidate properties stop alternating", () => {
    const { errors } = extractRevalidateFingerprints([
      file(
        "app/z/actions.ts",
        [
          `const SPEC = {`,
          `  revalidate: () => ["/admin"],`,
          `  name: "admin.z.create",`,
          `};`,
        ].join("\n")
      ),
    ]);
    expect(errors.some((e) => e.includes("strictly alternate"))).toBe(true);
  });
});

describe("renderMapEntries", () => {
  it("prints sorted, paste-ready map lines", () => {
    const rendered = renderMapEntries({
      "b.spec": ["/b"],
      "a.spec": ["/a", "page:/a/[id]"],
    });
    expect(rendered).toBe(
      [`  "a.spec": ["/a", "page:/a/[id]"],`, `  "b.spec": ["/b"],`].join("\n")
    );
  });
});
