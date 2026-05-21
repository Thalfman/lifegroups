// Per-action observability helper. One call at the top of a server action and
// one call before each return produces a single structured outcome line with
// request_id, latency_ms, and whatever context fields the caller passes.
//
// Imperative rather than a higher-order wrapper because the existing actions
// return discriminated ActionResult<T> shapes with many early exits — keeping
// control flow in the action avoids forcing every callsite into a closure.
//
// finish() is idempotent: the first call wins and subsequent calls are
// no-ops. That makes it safe to wrap an action body in a try/finally with a
// safety-net `ctx.finish("fail", { error_code: "unhandled_exception" })` in
// the finally block, so an unexpected throw still emits one terminal line.
// We don't roll that wrapper across every action by default — explicit
// returns are easier to read — but the pattern is available where actions
// have logic that might throw outside the typed RPC error path.

import { log, type LogContext, type LogOutcome } from "./logger";
import { newCorrelationId } from "./identifiers";

export type FinishFields = Omit<LogContext, "event" | "outcome" | "latency_ms" | "request_id">;

export type ActionLog = {
  readonly requestId: string;
  finish(outcome: LogOutcome, fields?: FinishFields): void;
};

export function startActionLog(routeOrAction: string): ActionLog {
  const requestId = newCorrelationId();
  const start = performance.now();
  let finished = false;

  return {
    requestId,
    finish(outcome, fields) {
      // Guard against double-finish (e.g. helper called inside a try/finally
      // after the happy path already logged). The second call is a no-op so
      // we don't emit a misleading second outcome line.
      if (finished) return;
      finished = true;

      const ctx: LogContext = {
        event: routeOrAction,
        route_or_action: routeOrAction,
        outcome,
        request_id: requestId,
        latency_ms: Math.round(performance.now() - start),
        ...fields,
      };

      if (outcome === "ok") log.info(ctx);
      else if (outcome === "fail") log.error(ctx);
      else log.warn(ctx);
    },
  };
}
