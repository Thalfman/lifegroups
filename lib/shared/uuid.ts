// Single source of truth for the UUID regex used at every trust
// boundary that reads an id-like value from an external source
// (Supabase responses, RPC results, request payloads).

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Trust-boundary reader for SECURITY DEFINER RPC results. The narrow
// admin_*/leader_*/super_admin_* RPCs each return a uuid string on success
// or null on rejection. Enforcing the documented contract here stops a
// misbehaving driver, future schema change, or test stub from tunnelling a
// non-uuid value into call sites that expect "is this the new row's id?"
// semantics. Returns the lowercased canonical form, or null.
export function readUuidRpcData(data: unknown): string | null {
  if (typeof data !== "string") return null;
  if (!UUID_RE.test(data)) return null;
  return data.toLowerCase();
}
