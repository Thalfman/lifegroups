// Single source of truth for the UUID regex used at every trust
// boundary that reads an id-like value from an external source
// (Supabase responses, RPC results, request payloads).

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
