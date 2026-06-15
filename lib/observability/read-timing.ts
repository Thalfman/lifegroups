// Read-bundle timing instrumentation (sibling to the write-side
// `startActionLog` in `instrument.ts`). A surface's read orchestration
// (`load*Data`) often fans several RLS reads out in parallel; wrapping that
// fan-out here emits one structured `read_bundle` line per load with the
// surface name and a measured `latency_ms`, so a genuinely slow Supabase read
// is distinguishable from an app failure and later index/query work can point
// at measured evidence rather than guesses.
//
// PRIVACY: the emitted signal carries ONLY the surface name, the outcome, the
// duration, and whatever coarse, non-private metadata the caller returns from
// `describe` (e.g. a result-kind discriminant). It must NEVER include row
// contents, names, care/prayer text, or any private field. `describe` runs on
// the success result only; keep it to shape/aggregate facts.

import { log } from "./logger";

// Coarse, non-private metadata merged into the success line. A discriminant
// like `result_kind: "ok" | "not_found" | "db_unavailable"` is the typical
// payload; counts (e.g. how many rows a list returned) are also fine. Do not
// put row contents or private fields here.
export type ReadBundleFields = Record<string, unknown>;

// Wraps a read-orchestration call with timing. Returns the loaded value
// unchanged (the data contract is untouched) and rethrows on failure after
// emitting a terminal line, mirroring how a real read failure would propagate
// to the page's degrade-gracefully handling.
export async function measureReadBundle<T>(
  surface: string,
  load: () => Promise<T>,
  describe?: (result: T) => ReadBundleFields
): Promise<T> {
  const start = performance.now();
  try {
    const result = await load();
    log.info({
      event: "read_bundle",
      surface,
      outcome: "ok",
      latency_ms: Math.round(performance.now() - start),
      ...(describe ? describe(result) : {}),
    });
    return result;
  } catch (error) {
    log.error({
      event: "read_bundle",
      surface,
      outcome: "fail",
      latency_ms: Math.round(performance.now() - start),
      error_code: "read_threw",
    });
    throw error;
  }
}
