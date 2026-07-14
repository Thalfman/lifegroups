import {
  PATCH_REMOVAL_NEXT_VERSION,
  SUPPORTED_BUNDLED_REACT_DOM_VERSION,
  SUPPORTED_NEXT_VERSION,
  hashSource,
  patchGuardedFile,
  patchSource,
  validateRuntime,
} from "../patch-next-react-dom-36134.mjs";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const DEVELOPMENT_VULNERABLE = `before
          ? (executionContext & RenderContext) === NoContext &&
            prepareFreshStack(root, 0)
          : (workInProgressRootPingedLanes |= pingedLanes),
after
`;

const DEVELOPMENT_PATCHED = `before
          ? (executionContext & RenderContext) === NoContext
            ? prepareFreshStack(root, 0)
            : (workInProgressRootPingedLanes |= pingedLanes)
          : (workInProgressRootPingedLanes |= pingedLanes),
after
`;

const PRODUCTION_VULNERABLE = `before
      ? 0 === (executionContext & 2) && prepareFreshStack(root, 0)
      : (workInProgressRootPingedLanes |= pingedLanes),
after
`;

const PRODUCTION_PATCHED = `before
      ? 0 === (executionContext & 2)
        ? prepareFreshStack(root, 0)
        : (workInProgressRootPingedLanes |= pingedLanes)
      : (workInProgressRootPingedLanes |= pingedLanes),
after
`;

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("temporary Next ReactDOM #36134 shim", () => {
  it("applies the exact development and production pinged-lane deltas", () => {
    expect(patchSource(DEVELOPMENT_VULNERABLE, "development")).toEqual({
      state: "patched",
      source: DEVELOPMENT_PATCHED,
    });
    expect(patchSource(PRODUCTION_VULNERABLE, "production")).toEqual({
      state: "patched",
      source: PRODUCTION_PATCHED,
    });
  });

  it("is idempotent but rejects missing or ambiguous fragments", () => {
    expect(patchSource(DEVELOPMENT_PATCHED, "development")).toEqual({
      state: "already-patched",
      source: DEVELOPMENT_PATCHED,
    });
    expect(() => patchSource("unrelated source", "development")).toThrow(
      /expected exactly one vulnerable or patched fragment/i
    );
    expect(() =>
      patchSource(
        DEVELOPMENT_VULNERABLE + DEVELOPMENT_VULNERABLE,
        "development"
      )
    ).toThrow(/expected exactly one vulnerable or patched fragment/i);
  });

  it("guards the exact Next runtime and documents the removal boundary", () => {
    expect(() =>
      validateRuntime({
        nextVersion: SUPPORTED_NEXT_VERSION,
        bundledReactDomVersion: SUPPORTED_BUNDLED_REACT_DOM_VERSION,
      })
    ).not.toThrow();
    expect(() =>
      validateRuntime({
        nextVersion: "16.2.10",
        bundledReactDomVersion: SUPPORTED_BUNDLED_REACT_DOM_VERSION,
      })
    ).toThrow(/unsupported Next version/i);
    expect(() =>
      validateRuntime({
        nextVersion: SUPPORTED_NEXT_VERSION,
        bundledReactDomVersion: "19.3.0-canary-drift",
      })
    ).toThrow(/unexpected bundled ReactDOM/i);
    expect(PATCH_REMOVAL_NEXT_VERSION).toBe("16.3.0");
  });

  it("patches a guarded file once and fails closed on hash drift", () => {
    tempDir = mkdtempSync(path.join(tmpdir(), "next-36134-"));
    const filePath = path.join(tempDir, "react-dom-client.js");
    const vulnerableHash = hashSource(DEVELOPMENT_VULNERABLE);
    const patchedHash = hashSource(DEVELOPMENT_PATCHED);
    writeFileSync(filePath, DEVELOPMENT_VULNERABLE);

    expect(
      patchGuardedFile({
        filePath,
        variant: "development",
        vulnerableHash,
        patchedHash,
      })
    ).toBe("patched");
    expect(readFileSync(filePath, "utf8")).toBe(DEVELOPMENT_PATCHED);
    expect(
      patchGuardedFile({
        filePath,
        variant: "development",
        vulnerableHash,
        patchedHash,
      })
    ).toBe("already-patched");

    writeFileSync(filePath, DEVELOPMENT_PATCHED + "// drift\n");
    expect(() =>
      patchGuardedFile({
        filePath,
        variant: "development",
        vulnerableHash,
        patchedHash,
      })
    ).toThrow(/hash drift/i);
  });
});
