// Server-action POST telemetry for the E2E lane (#839). Pure logic only — no
// value imports from @playwright/test — so the classification/formatting can
// be unit-tested under Vitest while helpers.ts wires it to real page events.
//
// Why: lane runs intermittently see a write stall >30s (submit frozen in its
// pending label) while the RPC + audit row commit fine. The trace shows THAT
// the form froze; these log lines show WHERE the request got stuck — before
// response headers, mid-stream while the revalidated flight payload was being
// delivered, or not at all. Passive by design: never asserts, never retries.

export type ServerActionPost = {
  actionId: string;
  // "fetch" = hydrated submit (`next-action` request header); "form" = native
  // document POST from a click that landed before hydration (the action id
  // travels as a $ACTION_ID_<hash> form field instead). Both run the same
  // server action; the lane's specs hit both paths, so track both.
  transport: "fetch" | "form";
};

export function classifyServerActionPost(
  method: string,
  headers: Record<string, string>,
  postData: string | null
): ServerActionPost | undefined {
  if (method.toUpperCase() !== "POST") return undefined;
  const headerId = headers["next-action"];
  if (headerId) return { actionId: headerId, transport: "fetch" };
  if (!postData?.includes("$ACTION_")) return undefined;
  // Two form encodings: a plain action posts a $ACTION_ID_<hash> field; a
  // bound action posts $ACTION_REF_n plus $ACTION_n:0 whose JSON value
  // carries {"id":"<hash>", ...}.
  const fieldId =
    postData.match(/\$ACTION_ID_([0-9a-f]+)/i) ??
    postData.match(/"id":\s*"([0-9a-f]{16,})"/i);
  return { actionId: fieldId?.[1] ?? "unknown", transport: "form" };
}

export type ActionRequestRecord = {
  actionId: string;
  transport: "fetch" | "form";
  path: string;
  startedAt: number;
  // Set when response headers arrive; a request can then still stall
  // mid-stream before `finished`.
  headersAt?: number;
  status?: number;
  finished: boolean;
};

// One tracker per test. The caller supplies `now` (epoch ms) on every event so
// this module stays clock-free; keys are opaque per-request identities (the
// Playwright Request object works — reference equality is all that's used).
export function createActionTracker(specLabel: string) {
  const records = new Map<unknown, ActionRequestRecord>();

  // Timestamped so a stall window lines up against the `ts` field of the
  // server's read_bundle lines in the same job log.
  const line = (now: number, message: string): string =>
    `[e2e] ${new Date(now).toISOString()} ${specLabel} — ${message}`;

  const describe = (record: ActionRequestRecord): string =>
    `action ${record.actionId} POST ${record.path}${
      record.transport === "form" ? " (native form post)" : ""
    }`;

  return {
    // page.on("request"): start tracking if this is a server-action POST.
    onRequest(
      key: unknown,
      method: string,
      headers: Record<string, string>,
      postData: string | null,
      url: string,
      now: number
    ): void {
      const action = classifyServerActionPost(method, headers, postData);
      if (!action) return;
      let path: string;
      try {
        path = new URL(url).pathname;
      } catch {
        path = url;
      }
      records.set(key, {
        ...action,
        path,
        startedAt: now,
        finished: false,
      });
    },

    // page.on("response"): headers received — the action result may still be
    // streaming (the same response carries the revalidated flight payload).
    onResponse(key: unknown, status: number, now: number): string | undefined {
      const record = records.get(key);
      if (!record) return undefined;
      record.headersAt = now;
      record.status = status;
      return line(
        now,
        `${describe(record)} → headers ${status} after ${now - record.startedAt}ms (body still streaming)`
      );
    },

    // page.on("requestfinished"): response body fully delivered.
    onFinished(key: unknown, now: number): string | undefined {
      const record = records.get(key);
      if (!record) return undefined;
      record.finished = true;
      records.delete(key);
      return line(
        now,
        `${describe(record)} → complete status ${record.status ?? "?"} in ${now - record.startedAt}ms total`
      );
    },

    // page.on("requestfailed"): the request errored (aborted, net failure).
    onFailed(
      key: unknown,
      failureText: string | null,
      now: number
    ): string | undefined {
      const record = records.get(key);
      if (!record) return undefined;
      records.delete(key);
      return line(
        now,
        `${describe(record)} → FAILED after ${now - record.startedAt}ms: ${failureText ?? "unknown failure"}`
      );
    },

    // Test end: anything still tracked never reached `requestfinished`. The
    // headers/no-headers split distinguishes "stuck before the response" from
    // "responded, then stalled mid-stream" — the question #839 asks.
    pendingReport(now: number): string[] {
      return [...records.values()].map((record) =>
        line(
          now,
          record.headersAt === undefined
            ? `${describe(record)} → STILL PENDING at test end, no response headers after ${now - record.startedAt}ms`
            : `${describe(record)} → STILL PENDING at test end, headers ${record.status} arrived at ${record.headersAt - record.startedAt}ms but body never finished (${now - record.startedAt}ms elapsed)`
        )
      );
    },
  };
}

export type ActionTracker = ReturnType<typeof createActionTracker>;
