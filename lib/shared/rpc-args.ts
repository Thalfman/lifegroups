// Collapses the mechanical Payload -> p_-prefixed Args copy that every write
// action used to hand-spell in its `rpc` closure (ADR 0001 write-action
// specs). The validated payload stays the authoritative shape owner with
// domain field names, and the explicit `...Args` types in
// lib/{admin,leader,over-shepherd}/rpc*.ts stay the hand-pinned DB trust
// boundary (ADR 0031) -- this helper only performs the copy between them, and
// the Args types must never be derived from payload types.
//
// The explicit `keys` array makes the argument set exact at RUNTIME:
// TypeScript's structural typing would NOT catch an extra key, and Postgres
// errors on unknown parameters. TypeScript then checks the produced record
// against the explicit Args entry at each adminRpc/leaderRpc call site, so a
// missing or mistyped field is a compile error. Closures with renamed keys,
// computed values, constants, or cross-field logic stay hand-written.

// Values a validated payload field may carry into an RPC argument: JSON
// scalars, arrays, and objects. undefined is normalized to null at the
// boundary: JSON-serialized RPC args DROP undefined keys entirely, which
// would silently fall back to the Postgres parameter default instead of
// writing NULL.
export type RpcArgValue =
  | string
  | number
  | boolean
  | null
  | readonly RpcArgValue[]
  | { readonly [key: string]: RpcArgValue | undefined };

// The produced shape: exactly the named keys, `p_`-prefixed, all required
// (`-?` strips payload optionality) with undefined replaced by null.
export type RpcArgsOf<V, K extends keyof V & string> = {
  [P in K as `p_${P}`]-?: undefined extends V[P]
    ? Exclude<V[P], undefined> | null
    : V[P];
};

export function toRpcArgs<V extends object, K extends keyof V & string>(
  value: V,
  keys: readonly K[]
): RpcArgsOf<V, K> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const v = value[key];
    out[`p_${key}`] = v === undefined ? null : v;
  }
  return out as RpcArgsOf<V, K>;
}
