// Lightweight structured logger. Emits a single JSON line per call so log
// drains (Vercel, Datadog, plain stdout collectors) can parse without a
// transport. Required field is `event`; everything else is optional and
// callers extend with whatever fields aid triage.
//
// Field conventions used across auth/session/action paths:
//   - event:           short snake_case identifier ("login_success")
//   - route_or_action: route path or server action name
//   - actor_role:      UserRole or null when unauthenticated
//   - request_id:      correlation id from newCorrelationId()
//   - latency_ms:      end-to-end ms for the unit of work
//   - outcome:         "ok" | "fail" | "denied" | "throttled"
//   - error_code:      stable code for filtering (e.g. supabase error name)

export type LogOutcome = "ok" | "fail" | "denied" | "throttled";

export type LogContext = {
  event: string;
  route_or_action?: string;
  actor_role?: string | null;
  request_id?: string;
  latency_ms?: number;
  outcome?: LogOutcome;
  error_code?: string;
  [key: string]: unknown;
};

type Level = "info" | "warn" | "error";

function emit(level: Level, ctx: LogContext): void {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    ...ctx,
  };
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({
      ts: payload.ts,
      level,
      event: ctx.event,
      _serialize_error: true,
    });
  }
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (ctx: LogContext) => emit("info", ctx),
  warn: (ctx: LogContext) => emit("warn", ctx),
  error: (ctx: LogContext) => emit("error", ctx),
};
