import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  REQUIRED_TOOLS,
  checkToolchain,
  formatRemediation,
  shimExists,
} from "../verify-toolchain.mjs";

// #545 — characterize the toolchain preflight against a real temp bin dir
// (no mocks): a healthy install passes, a partial/missing install fails with a
// concrete remediation message, so the canonical scripts stop emitting
// misleading TypeScript / "not recognized" noise.

let binDir: string;

beforeEach(() => {
  binDir = mkdtempSync(path.join(tmpdir(), "toolchain-"));
});

afterEach(() => {
  rmSync(binDir, { recursive: true, force: true });
});

function writeShim(bin: string): void {
  writeFileSync(path.join(binDir, bin), "#!/bin/sh\n");
}

describe("checkToolchain", () => {
  it("reports ok when every required shim is present (healthy install)", () => {
    for (const tool of REQUIRED_TOOLS) writeShim(tool.bin);
    const result = checkToolchain({ binDir });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toHaveLength(REQUIRED_TOOLS.length);
  });

  it("flags exactly the missing tool when one shim is absent", () => {
    // Everything but the Vitest shim installed → only that gap is reported,
    // and the others are not dragged down with it.
    for (const tool of REQUIRED_TOOLS) {
      if (tool.bin !== "vitest") writeShim(tool.bin);
    }
    const result = checkToolchain({ binDir });
    expect(result.ok).toBe(false);
    expect(result.missing.map((tool) => tool.bin)).toEqual(["vitest"]);
  });

  it("reports all tools missing for an empty bin dir (broken install)", () => {
    const result = checkToolchain({ binDir });
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(REQUIRED_TOOLS.length);
    expect(result.present).toEqual([]);
  });

  it("accepts a Windows .cmd shim as present", () => {
    writeFileSync(path.join(binDir, "eslint.cmd"), "@echo off\n");
    expect(shimExists(binDir, "eslint")).toBe(true);
  });
});

describe("formatRemediation", () => {
  it("names each missing tool, its script, and points at npm ci", () => {
    const message = formatRemediation([
      { label: "Vitest", bin: "vitest", script: "test:run" },
    ]);
    expect(message).toContain("Vitest");
    expect(message).toContain("node_modules/.bin/vitest");
    expect(message).toContain("npm run test:run");
    expect(message).toContain("npm ci");
  });
});
