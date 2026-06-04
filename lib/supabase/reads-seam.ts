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

export function bindReads<
  T extends Record<string, (client: ReadClient, ...args: never[]) => unknown>,
>(client: ReadClient, fetchers: T): BoundReads<T> {
  return Object.fromEntries(
    Object.entries(fetchers).map(([key, fetcher]) => [
      key,
      (...args: never[]) => fetcher(client, ...args),
    ])
  ) as BoundReads<T>;
}
