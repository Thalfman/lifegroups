import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockError } = vi.hoisted(() => ({
  mockError: vi.fn(),
}));

vi.mock("../logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: mockError },
}));

import { logClientError, parseClientErrorReport } from "../client-errors";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseClientErrorReport", () => {
  it("normalizes a valid boundary report", () => {
    const report = parseClientErrorReport(
      JSON.stringify({
        name: "TypeError",
        message: "Cannot read properties of undefined",
        digest: "1234567890",
        pathname: "/admin/care",
      })
    );
    expect(report).toEqual({
      error_name: "TypeError",
      error_message: "Cannot read properties of undefined",
      digest: "1234567890",
      route: "/admin/care",
    });
  });

  it("normalizes the route so a secret-bearing path never reaches logs", () => {
    const token = "dGhpc0lzQTQzQ2hhckJhc2U2NHVybFRva2VuRXhhbXBsZQ";
    const report = parseClientErrorReport(
      JSON.stringify({ name: "Error", pathname: `/invite/${token}` })
    );
    expect(report?.route).toBe("/invite/:id");
  });

  it("truncates an oversized message and tolerates a missing one", () => {
    const long = parseClientErrorReport(
      JSON.stringify({ name: "Error", message: "x".repeat(1000) })
    );
    expect(long?.error_message).toHaveLength(300);

    const missing = parseClientErrorReport(JSON.stringify({ name: "Error" }));
    expect(missing?.error_message).toBe("");
    expect(missing?.digest).toBeNull();
    expect(missing?.route).toBe("unknown");
  });

  it("drops malformed bodies (bad JSON, missing name, non-object)", () => {
    expect(parseClientErrorReport("not json")).toBeNull();
    expect(parseClientErrorReport(JSON.stringify({ message: "m" }))).toBeNull();
    expect(parseClientErrorReport(JSON.stringify({ name: "  " }))).toBeNull();
    expect(parseClientErrorReport(JSON.stringify(null))).toBeNull();
    expect(parseClientErrorReport(JSON.stringify(["Error"]))).toBeNull();
    expect(parseClientErrorReport(JSON.stringify({ name: 42 }))).toBeNull();
  });

  it("drops an oversized raw body before parsing", () => {
    const raw = JSON.stringify({ name: "Error", message: "x".repeat(4000) });
    expect(parseClientErrorReport(raw)).toBeNull();
  });
});

describe("logClientError", () => {
  it("emits one structured client_error line for a valid report", () => {
    logClientError(
      JSON.stringify({
        name: "ChunkLoadError",
        message: "Loading chunk 42 failed",
        digest: "abc123",
        pathname: "/admin/groups/42",
      })
    );
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError).toHaveBeenCalledWith({
      event: "client_error",
      outcome: "fail",
      error_name: "ChunkLoadError",
      error_message: "Loading chunk 42 failed",
      digest: "abc123",
      route: "/admin/groups/:id",
    });
  });

  it("no-ops on a malformed body", () => {
    logClientError("garbage");
    expect(mockError).not.toHaveBeenCalled();
  });
});
