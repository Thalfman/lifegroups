import { describe, expect, it } from "vitest";
import {
  classifyServerActionPost,
  createActionTracker,
} from "../action-telemetry";

// The tracker is the E2E lane's stall telemetry (#839): it classifies
// server-action POSTs and formats the lifecycle log lines the specs emit.
// Pure and clock-free (callers pass epoch-ms), so it is testable here without
// Playwright.

const T0 = Date.UTC(2026, 6, 3, 12, 0, 0); // 2026-07-03T12:00:00.000Z

describe("classifyServerActionPost", () => {
  it("classifies a hydrated submit by its next-action header", () => {
    expect(
      classifyServerActionPost("POST", { "next-action": "abc123" }, null)
    ).toEqual({ actionId: "abc123", transport: "fetch" });
  });

  it("classifies a pre-hydration native form POST by its $ACTION_ID_ field", () => {
    const multipartBody =
      '------x\r\nContent-Disposition: form-data; name="$ACTION_ID_7f00aa"\r\n\r\n\r\n------x--';
    expect(classifyServerActionPost("POST", {}, multipartBody)).toEqual({
      actionId: "7f00aa",
      transport: "form",
    });
  });

  it("classifies a bound action's native form POST ($ACTION_REF_n encoding)", () => {
    // What the browser actually sends for a bound action submitted before
    // hydration: a $ACTION_REF_n field plus a $ACTION_n:0 field whose JSON
    // value carries the action id.
    const multipartBody =
      '------x\r\nContent-Disposition: form-data; name="$ACTION_REF_1"\r\n\r\n\r\n------x\r\nContent-Disposition: form-data; name="$ACTION_1:0"\r\n\r\n{"id":"60cbdb16d1f4bccea6028066451b5cf259d8567b94","bound":"$@1"}\r\n------x--';
    expect(classifyServerActionPost("POST", {}, multipartBody)).toEqual({
      actionId: "60cbdb16d1f4bccea6028066451b5cf259d8567b94",
      transport: "form",
    });
  });

  it("ignores POSTs that are neither", () => {
    expect(
      classifyServerActionPost(
        "POST",
        { "content-type": "text/plain" },
        "hello"
      )
    ).toBeUndefined();
  });

  it("ignores non-POST requests even with the header", () => {
    expect(
      classifyServerActionPost("GET", { "next-action": "abc123" }, null)
    ).toBeUndefined();
  });
});

describe("createActionTracker", () => {
  const start = (
    tracker: ReturnType<typeof createActionTracker>,
    key: unknown
  ) =>
    tracker.onRequest(
      key,
      "POST",
      { "next-action": "abc123" },
      null,
      "http://127.0.0.1:3211/admin/plan",
      T0
    );

  it("logs headers-received and body-complete with elapsed ms", () => {
    const tracker = createActionTracker("spec › test");
    const key = {};
    start(tracker, key);

    const headersLine = tracker.onResponse(key, 200, T0 + 250);
    expect(headersLine).toBe(
      "[e2e] 2026-07-03T12:00:00.250Z spec › test — action abc123 POST /admin/plan → headers 200 after 250ms (body still streaming)"
    );

    const finishedLine = tracker.onFinished(key, T0 + 1400);
    expect(finishedLine).toBe(
      "[e2e] 2026-07-03T12:00:01.400Z spec › test — action abc123 POST /admin/plan → complete status 200 in 1400ms total"
    );

    // Finished requests leave the pending set.
    expect(tracker.pendingReport(T0 + 30_000)).toEqual([]);
  });

  it("marks native form posts in the log line", () => {
    const tracker = createActionTracker("spec › test");
    const key = {};
    tracker.onRequest(
      key,
      "POST",
      {},
      'name="$ACTION_ID_7f00aa"',
      "http://127.0.0.1:3211/login",
      T0
    );
    expect(tracker.onResponse(key, 303, T0 + 90)).toContain(
      "action 7f00aa POST /login (native form post) → headers 303 after 90ms"
    );
  });

  it("logs a failed request with the failure text and stops tracking it", () => {
    const tracker = createActionTracker("spec › test");
    const key = {};
    start(tracker, key);

    const failedLine = tracker.onFailed(key, "net::ERR_ABORTED", T0 + 500);
    expect(failedLine).toContain("FAILED after 500ms: net::ERR_ABORTED");
    expect(tracker.pendingReport(T0 + 30_000)).toEqual([]);
  });

  it("reports a request that never got response headers as still pending", () => {
    const tracker = createActionTracker("spec › test");
    start(tracker, {});

    const report = tracker.pendingReport(T0 + 31_000);
    expect(report).toHaveLength(1);
    expect(report[0]).toContain(
      "STILL PENDING at test end, no response headers after 31000ms"
    );
  });

  it("distinguishes a mid-stream stall (headers arrived, body never finished)", () => {
    const tracker = createActionTracker("spec › test");
    const key = {};
    start(tracker, key);
    tracker.onResponse(key, 200, T0 + 300);

    const report = tracker.pendingReport(T0 + 31_000);
    expect(report).toHaveLength(1);
    expect(report[0]).toContain(
      "headers 200 arrived at 300ms but body never finished (31000ms elapsed)"
    );
  });

  it("ignores lifecycle events for requests it never tracked", () => {
    const tracker = createActionTracker("spec › test");
    // A plain navigation GET is never registered…
    tracker.onRequest({}, "GET", {}, null, "http://127.0.0.1:3211/admin", T0);
    // …so downstream events for unknown keys emit nothing.
    expect(tracker.onResponse({}, 200, T0 + 100)).toBeUndefined();
    expect(tracker.onFinished({}, T0 + 100)).toBeUndefined();
    expect(tracker.onFailed({}, "boom", T0 + 100)).toBeUndefined();
    expect(tracker.pendingReport(T0 + 100)).toEqual([]);
  });

  it("keeps the raw URL when it is not parseable", () => {
    const tracker = createActionTracker("spec › test");
    const key = {};
    tracker.onRequest(
      key,
      "POST",
      { "next-action": "abc123" },
      null,
      "not-a-url",
      T0
    );
    expect(tracker.onResponse(key, 303, T0 + 10)).toContain(
      "action abc123 POST not-a-url → headers 303"
    );
  });
});
