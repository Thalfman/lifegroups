import type { AppSupabaseClient } from "./types";

export type ReadClient = AppSupabaseClient;

export type ReadResult<T> =
  | { data: T; error: null }
  | { data: null; error: Error };

export function wrapError(prefix: string, err: unknown): Error {
  if (err instanceof Error) return new Error(`${prefix}: ${err.message}`);
  return new Error(`${prefix}: ${String(err)}`);
}

/**
 * UTC-anchored YYYY-MM-DD string for "today", used by every shepherd-care
 * read/composition path so date math (stale window, overdue touchpoints,
 * upcoming window) stays consistent across server timezones.
 */
export function currentUtcDateIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Decode a raw jsonb object (e.g. a grade row's `criterion_scores`) into a
 * clean `Record<string, number>` at the trust boundary, dropping any
 * non-finite or non-numeric value. Used by the Care / leader / multiplication
 * grade readers so the criterion-score decode lives in one place.
 */
export function decodeNumericRecord(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function differenceInDaysIso(today: string, then: string): number {
  // Both inputs are YYYY-MM-DD; Date.parse with the ISO string at midnight UTC
  // is stable across server timezones. Truncate the result to whole days.
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${then}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((a - b) / 86_400_000);
}

/**
 * PostgREST returns an embedded to-one relation as either the object itself or
 * a one-element array, depending on how the client infers the join's
 * cardinality (and on the client version). The reads seam used to re-spell the
 * `Array.isArray(x) ? x[0] ?? null : x` dance inline in every projector that
 * flattens a join. This primitive gives that quirk one home and one test
 * surface: normalise the array, single-object, and missing arms to `T | null`.
 *
 * Named-column-agnostic by design — it only flattens the embed shape; the
 * caller keeps its explicit allowlist and its typed output.
 */
export function unwrapEmbed<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// The Supabase filter builder a `fetchByIds` refinement receives. Derived from
// the live client so the helper tracks the installed `@supabase/postgrest-js`
// surface (`.eq`, `.is`, `.order`, …) without importing the transitive package
// directly. After `.select(...)` and `.in(...)` the builder is still this type,
// so a refinement returns the same builder.
type IdTableBuilder = ReturnType<ReadClient["from"]>;
export type IdFilterBuilder = ReturnType<IdTableBuilder["select"]>;

const DEFAULT_ID_CHUNK_SIZE = 500;

/**
 * Fetch rows by a set of ids, owning the two-step shape several reads repeat:
 * deduplicate the ids, short-circuit on the empty set, then fetch the real
 * rows with a chunked `.in(idColumn, …)`. Callers pass their explicit column
 * allowlist (never `select("*")`); a `refine` callback layers on any extra
 * predicate/order the read needs (e.g. `archived_at is null`, an active-status
 * filter). Degrades gracefully like the surrounding reads — a failed fetch
 * returns an `Error`, never a false-empty.
 *
 * Chunking guards the `.in(...)` URL length for large id sets; each chunk is
 * fetched in declaration order. A `refine` `.order(...)` therefore sorts within
 * a chunk — fine for the small id sets these reads carry (a leader's groups, a
 * board's categories), and the order-sensitive caller stays well under one
 * chunk.
 */
export async function fetchByIds<Row>(
  client: ReadClient,
  table: string,
  ids: readonly string[],
  columns: string,
  options: {
    idColumn?: string;
    label?: string;
    refine?: (query: IdFilterBuilder) => IdFilterBuilder;
    chunkSize?: number;
  } = {}
): Promise<ReadResult<Row[]>> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return { data: [], error: null };

  const idColumn = options.idColumn ?? "id";
  const label = options.label ?? `fetchByIds(${table})`;
  const chunkSize =
    options.chunkSize && options.chunkSize > 0
      ? options.chunkSize
      : DEFAULT_ID_CHUNK_SIZE;

  // The typed client's `.from` expects a literal table name; this helper is
  // table-generic, so loosen that one signature (the column allowlist + `Row`
  // generic keep the read itself explicit).
  const from = client.from as unknown as (t: string) => IdTableBuilder;

  const out: Row[] = [];
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const base = from(table).select(columns).in(idColumn, chunk);
    const query = options.refine ? options.refine(base) : base;
    const { data, error } = await query;
    if (error) return { data: null, error: wrapError(label, error) };
    if (data) out.push(...(data as Row[]));
  }
  return { data: out, error: null };
}

/**
 * Self-pinning column allowlist. `columns<Row>()(...names)` takes the named
 * columns once and derives **both** the PostgREST `.select` string and the
 * projected row type from that single list — so widening a read is a deliberate
 * typed diff, not a select string and a hand-maintained row type drifting apart.
 *
 * Curried so the row type is named explicitly while the column names infer:
 *
 *   const COLS = columns<FollowUpsRow>()("id", "title");
 *   COLS.select; // "id, title"
 *   type Row = RowOf<typeof COLS>; // Pick<FollowUpsRow, "id" | "title">
 *
 * Each name is constrained to `keyof Row`, so binding the list to a narrowed
 * row type (e.g. `Omit<…, "admin_private_note">`) turns adding the excluded
 * column into a **compile error**, not just a failed grep. See #730.
 */
export type ColumnSet<Row, Key extends keyof Row> = {
  /** The named columns, pinned to `Row` and frozen in declaration order. */
  readonly list: readonly Key[];
  /** The PostgREST `.select(...)` string derived from {@link list}. */
  readonly select: string;
  /** Phantom carrier for the projected row type; never read at runtime. */
  readonly __row?: Pick<Row, Key>;
};

/** The projected row type of a {@link ColumnSet}: `Pick<Row, listed keys>`. */
export type RowOf<C> =
  C extends ColumnSet<infer Row, infer Key> ? Pick<Row, Key> : never;

export function columns<Row>() {
  return <const Key extends keyof Row & string>(
    ...list: Key[]
  ): ColumnSet<Row, Key> => ({
    list,
    select: list.join(", "),
  });
}
