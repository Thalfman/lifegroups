import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInfo, mockError } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("../logger", () => ({
  log: { info: mockInfo, warn: vi.fn(), error: mockError },
}));

import { measureReadBundle } from "../read-timing";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("measureReadBundle", () => {
  it("returns the loaded value unchanged", async () => {
    const value = { kind: "ok", rows: [1, 2, 3] };
    const result = await measureReadBundle("group_detail", async () => value);

    expect(result).toBe(value);
  });

  it("emits one info line with surface, ok outcome, and a numeric latency", async () => {
    await measureReadBundle("multiply_grid", async () => 42);

    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockError).not.toHaveBeenCalled();
    const ctx = mockInfo.mock.calls[0][0];
    expect(ctx.event).toBe("read_bundle");
    expect(ctx.surface).toBe("multiply_grid");
    expect(ctx.outcome).toBe("ok");
    expect(typeof ctx.latency_ms).toBe("number");
  });

  it("merges only the describe metadata into the success line", async () => {
    await measureReadBundle(
      "group_detail",
      async () => ({ kind: "not_found" as const }),
      (r) => ({ result_kind: r.kind })
    );

    const ctx = mockInfo.mock.calls[0][0];
    expect(ctx.result_kind).toBe("not_found");
    // The emitted signal stays a known, non-private shape.
    expect(Object.keys(ctx).sort()).toEqual(
      ["event", "latency_ms", "outcome", "result_kind", "surface"].sort()
    );
  });

  it("emits a fail line and rethrows when the load throws", async () => {
    const boom = new Error("db exploded");

    await expect(
      measureReadBundle("group_detail", async () => {
        throw boom;
      })
    ).rejects.toBe(boom);

    expect(mockInfo).not.toHaveBeenCalled();
    expect(mockError).toHaveBeenCalledTimes(1);
    const ctx = mockError.mock.calls[0][0];
    expect(ctx.event).toBe("read_bundle");
    expect(ctx.outcome).toBe("fail");
    expect(ctx.error_code).toBe("read_threw");
  });
});
