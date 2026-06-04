import type { ReadResult } from "./read-core";

// The read-batch combinator. "Run N reads in parallel, keep each result, and
// surface which ones failed" is the gather-and-degrade rule every admin
// surface needs before it assembles its view. It was hand-spelled several ways
// — a firstError gate on the dashboard, an `errors` bag on follow-ups, a chain
// of `a.error ?? b.error` masks on launch-planning. This concentrates the rule
// in one place; each surface keeps its own empty shape and error precedence as
// *data* (which keys it reads, in what order), not as re-implemented control
// flow. See docs/adr/0015.

type ReadThunk = () => Promise<ReadResult<unknown>>;
type ReadThunks = Record<string, ReadThunk>;

export type ReadBatch<T extends ReadThunks> = {
  // Each read's raw `{ data, error }`, preserved under its key so a surface can
  // narrow per-read (`results.groups.data ?? []`).
  results: { [K in keyof T]: Awaited<ReturnType<T[K]>> };
  // Per-key error message (the read's `Error.message`), or null on success.
  // A surface composes its own precedence from these (e.g.
  // `errors.groups ?? errors.memberships`).
  errors: { [K in keyof T]: string | null };
  // The first error in declaration order, or null if every read succeeded —
  // the common "gate the whole view on any failure" case.
  firstError: string | null;
  // True when every read succeeded.
  ok: boolean;
};

// Run the reads concurrently (so latency tracks the slowest, not the sum) and
// fold their results into one batch. Declaration order of `reads` defines the
// `firstError` precedence.
export async function readBatch<T extends ReadThunks>(
  reads: T
): Promise<ReadBatch<T>> {
  const keys = Object.keys(reads) as (keyof T)[];
  const settled = await Promise.all(keys.map((key) => reads[key]()));

  const results = {} as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
  const errors = {} as { [K in keyof T]: string | null };
  let firstError: string | null = null;

  keys.forEach((key, index) => {
    const result = settled[index];
    results[key] = result as (typeof results)[typeof key];
    const message = result.error ? result.error.message : null;
    errors[key] = message;
    if (message !== null && firstError === null) firstError = message;
  });

  return { results, errors, firstError, ok: firstError === null };
}
