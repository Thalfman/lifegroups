import { log } from "@/lib/observability/logger";

import type { ReadClient } from "./read-core";

// The reads seam, as a shared scaffold. A surface's read-orchestration is a
// pure function of an interface whose methods are its read-model fetchers with
// the Supabase `client` argument already applied. Production binds the live
// client through `bindReads`; a test binds an in-memory adapter satisfying the
// same interface. Two adapters, one seam.
//
// This machinery first lived privately in `lib/dashboard/queries.ts` (it served
// only the admin dashboard). It is lifted here so every surface declares the
// subset of reads it needs and binds the client through one utility, rather
// than re-deriving the scaffold per surface. See docs/adr/0015.
//
// Instrumentation: passing the optional `surface` label makes the seam the
// per-read timing point (sibling to the page-level `measureReadBundle` in
// `lib/observability/read-timing.ts`, whose read_bundle contract is untouched).
// A labelled adapter times each bound fetcher and emits a `read_unit` line
// ONLY when a read is slow (>= SLOW_READ_UNIT_MS) or fails — healthy fast
// reads emit nothing, keeping log-drain volume flat. Without a label the
// binding is the plain curry, byte-identical to the uninstrumented seam.
//
// PRIVACY (same hard rule as read-timing.ts): a read_unit line carries ONLY
// the surface name, the fetcher key, the outcome, the duration, and a stable
// error_code. It must NEVER include fetcher arguments, row contents, names,
// care/prayer text, or any private field.

// A successful read at or above this duration (ms) emits a `read_unit` warn
// line; anything faster stays silent.
export const SLOW_READ_UNIT_MS = 400;

// Strip the leading `client: ReadClient` parameter from a read-model fetcher,
// leaving the interface a caller (or test) crosses.
export type OmitClient<F> = F extends (
  client: ReadClient,
  ...rest: infer R
) => infer Ret
  ? (...rest: R) => Ret
  : never;

// Given a record of read-model fetchers (each taking the client as its first
// argument), produce the seam adapter with the client curried into every
// method. Adding a read to a surface's seam is one entry in the fetcher map
// below — not a hand-written forwarder line.
export type BoundReads<
  T extends Record<string, (client: ReadClient, ...args: never[]) => unknown>,
> = { [K in keyof T]: OmitClient<T[K]> };

// A resolved value in the reads' `ReadResult` shape whose `error` arm is
// populated — the degrade-gracefully failure path that never throws.
function isFailedReadResult(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    "error" in value &&
    (value as { error: unknown }).error != null
  );
}

function instrument(
  surface: string,
  read: string,
  fetcher: (...args: never[]) => unknown
): (...args: never[]) => unknown {
  return async (...args: never[]) => {
    const start = performance.now();
    try {
      const result = await fetcher(...args);
      const latency_ms = Math.round(performance.now() - start);
      if (isFailedReadResult(result)) {
        log.warn({
          event: "read_unit",
          surface,
          read,
          outcome: "fail",
          latency_ms,
          error_code: "read_failed",
        });
      } else if (latency_ms >= SLOW_READ_UNIT_MS) {
        log.warn({
          event: "read_unit",
          surface,
          read,
          outcome: "ok",
          latency_ms,
        });
      }
      return result;
    } catch (error) {
      log.error({
        event: "read_unit",
        surface,
        read,
        outcome: "fail",
        latency_ms: Math.round(performance.now() - start),
        error_code: "read_threw",
      });
      throw error;
    }
  };
}

export function bindReads<
  T extends Record<string, (client: ReadClient, ...args: never[]) => unknown>,
>(client: ReadClient, fetchers: T, surface?: string): BoundReads<T> {
  return Object.fromEntries(
    Object.entries(fetchers).map(([key, fetcher]) => {
      const bound = (...args: never[]) => fetcher(client, ...args);
      return [key, surface ? instrument(surface, key, bound) : bound];
    })
  ) as BoundReads<T>;
}
