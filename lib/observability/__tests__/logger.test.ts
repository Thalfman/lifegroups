import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { log } from "../logger";

// The logger is incident-response infrastructure: one structured JSON line per
// call, routed to the console method matching the level. These smoke tests pin
// the emitted shape and routing so a refactor can't silently drop diagnostics.

let infoSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function parseLast(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const lastCall = spy.mock.calls.at(-1);
  expect(lastCall).toBeDefined();
  return JSON.parse(lastCall![0] as string);
}

describe("log", () => {
  it("emits one JSON line with ts, level, event, and merged context (info → console.log)", () => {
    log.info({
      event: "login_success",
      actor_role: "ministry_admin",
      request_id: "req-1",
      outcome: "ok",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const payload = parseLast(infoSpy);
    expect(payload.level).toBe("info");
    expect(payload.event).toBe("login_success");
    expect(payload.actor_role).toBe("ministry_admin");
    expect(payload.request_id).toBe("req-1");
    expect(payload.outcome).toBe("ok");
    expect(typeof payload.ts).toBe("string");
  });

  it("routes warn → console.warn and error → console.error", () => {
    log.warn({ event: "throttled", outcome: "throttled" });
    log.error({ event: "rpc_failure", outcome: "fail", error_code: "boom" });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(parseLast(warnSpy).level).toBe("warn");
    const err = parseLast(errorSpy);
    expect(err.level).toBe("error");
    expect(err.error_code).toBe("boom");
  });

  it("never throws on an unserializable context — emits a serialize-error marker line", () => {
    const circular: { event: string; self?: unknown } = { event: "weird" };
    circular.self = circular;

    expect(() => log.info(circular)).not.toThrow();
    const payload = parseLast(infoSpy);
    expect(payload._serialize_error).toBe(true);
    expect(payload.event).toBe("weird");
    expect(payload.level).toBe("info");
  });
});
