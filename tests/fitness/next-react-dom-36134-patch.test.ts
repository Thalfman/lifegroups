import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PATCH_FILES,
  PATCH_REMOVAL_NEXT_VERSION,
  SUPPORTED_BUNDLED_REACT_DOM_VERSION,
  SUPPORTED_NEXT_VERSION,
} from "../../scripts/patch-next-react-dom-36134.mjs";

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8")
) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};
const nextRoot = path.join(root, "node_modules", "next");
const nextPackage = JSON.parse(
  readFileSync(path.join(nextRoot, "package.json"), "utf8")
) as { version?: string };
const reactDomRoot = path.join(nextRoot, "dist", "compiled", "react-dom");

function fileHash(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

describe("fitness: temporary Next ReactDOM #36134 runtime shim", () => {
  it("runs the fail-closed shim after every dependency install", () => {
    expect(packageJson.scripts?.postinstall).toBe(
      "node scripts/patch-next-react-dom-36134.mjs"
    );
  });

  it("stays pinned to the one verified Next runtime", () => {
    expect(packageJson.dependencies?.next).toBe(SUPPORTED_NEXT_VERSION);
    expect(nextPackage.version).toBe(SUPPORTED_NEXT_VERSION);

    const versionSource = readFileSync(
      path.join(reactDomRoot, "cjs", "react-dom.production.js"),
      "utf8"
    );
    expect(versionSource).toContain(
      `exports.version = "${SUPPORTED_BUNDLED_REACT_DOM_VERSION}"`
    );
  });

  it("verifies all four installed client bundles carry the patched hash", () => {
    expect(PATCH_FILES.map((file) => file.relativePath).sort()).toEqual(
      [
        "cjs/react-dom-client.development.js",
        "cjs/react-dom-client.production.js",
        "cjs/react-dom-profiling.development.js",
        "cjs/react-dom-profiling.profiling.js",
      ].sort()
    );

    for (const file of PATCH_FILES) {
      expect(
        fileHash(path.join(reactDomRoot, file.relativePath)),
        `${file.relativePath} must be patched by postinstall`
      ).toBe(file.patchedHash);
    }
  });

  it("makes the stable Next removal boundary explicit", () => {
    expect(PATCH_REMOVAL_NEXT_VERSION).toBe("16.3.0");
  });
});
