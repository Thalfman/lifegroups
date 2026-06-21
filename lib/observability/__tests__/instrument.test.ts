import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInfo, mockWarn, mockError } = vi.hoisted(() => ({
  mockInfo: vi.fn(),
  mockWarn: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("../logger", () => ({
  log: { info: mockInfo, warn: mockWarn, error: mockError },
}));

import { startActionLog } from "../instrument";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("startActionLog", () => {
  it("returns a correlation id and emits one terminal line on finish", () => {
    const action = startActionLog("admin.create_group");
    expect(typeof action.requestId).toBe("string");
    expect(action.requestId.length).toBeGreaterThan(0);

    action.finish("ok", { actor_role: "ministry_admin" });

    expect(mockInfo).toHaveBeenCalledTimes(1);
    const ctx = mockInfo.mock.calls[0][0];
    expect(ctx.event).toBe("admin.create_group");
    expect(ctx.route_or_action).toBe("admin.create_group");
    expect(ctx.outcome).toBe("ok");
    expect(ctx.request_id).toBe(action.requestId);
    expect(typeof ctx.latency_ms).toBe("number");
    expect(ctx.actor_role).toBe("ministry_admin");
  });

  it("routes outcome to the matching level (ok→info, fail→error, denied/throttled→warn)", () => {
    startActionLog("a").finish("fail", { error_code: "rpc_error" });
    startActionLog("b").finish("denied");
    startActionLog("c").finish("throttled");

    expect(mockError).toHaveBeenCalledTimes(1);
    expect(mockError.mock.calls[0][0].error_code).toBe("rpc_error");
    expect(mockWarn).toHaveBeenCalledTimes(2);
    expect(mockInfo).not.toHaveBeenCalled();
  });

  it("is idempotent — a second finish is a no-op so only one outcome line is emitted", () => {
    const action = startActionLog("admin.update");
    action.finish("ok");
    action.finish("fail", { error_code: "should_not_emit" });

    expect(mockInfo).toHaveBeenCalledTimes(1);
    expect(mockError).not.toHaveBeenCalled();
  });
});
