// Shared Edge-Function error plumbing for the Super-Admin surfaces that invoke
// Supabase Edge Functions (invite-user, manage-test-auth-users) and surface the
// failure to a diagnostics panel. Both surfaces redact JWTs, pull the structured
// body off the thrown Response, map known tokens to human messages, and
// synthesize a token from the HTTP status when no body is available. The pieces
// that differ per surface — the token→message map, the status→token defaults,
// and the exact diagnostic lines — stay arguments so the rendered error output
// is byte-identical to the per-surface code this replaces.

// A JWT (header.payload.signature) so error text can't leak a live token into
// the Super-Admin diagnostics panel.
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

export function redact(message: string): string {
  return message.replace(JWT_PATTERN, "[REDACTED_JWT]");
}

// supabase-js v2.45 returns `FunctionsHttpError` (and friends) on non-2xx
// responses. The original Response is on `.context`. The Edge Function's JSON
// body is the only way to surface its structured `code` / `missing` fields to
// the panel, since `error.message` is just the generic "Edge Function returned
// a non-2xx status code".
export async function extractErrorBody<T>(
  err: unknown
): Promise<{ status: number | null; body: Partial<T> | null }> {
  if (!err || typeof err !== "object") return { status: null, body: null };
  const ctx = (err as { context?: unknown }).context;
  if (!(ctx instanceof Response)) return { status: null, body: null };
  const status = ctx.status;
  try {
    const text = await ctx.clone().text();
    if (!text) return { status, body: null };
    return { status, body: JSON.parse(text) as Partial<T> };
  } catch {
    return { status, body: null };
  }
}

// Token → safe human message. Unknown tokens pass through unchanged so the raw
// code is still visible in diagnostics.
export function makeMapFnError(
  messages: Record<string, string>
): (raw: string) => string {
  return (raw: string) => messages[raw] ?? raw;
}

// Synthesize a token from HTTP status when no structured body is available
// (e.g. an infra-level 404 from the gateway, or an unparseable body). The
// per-surface map supplies 401/403/404, the 500+ token, and the fallback.
export function makeTokenForStatus(map: {
  unauthorized: string;
  forbidden: string;
  notFound: string;
  serverError: string;
  fallback: string;
}): (status: number | null) => string {
  return (status: number | null) => {
    if (status === 401) return map.unauthorized;
    if (status === 403) return map.forbidden;
    if (status === 404) return map.notFound;
    if (status && status >= 500) return map.serverError;
    return map.fallback;
  };
}

export type PostgrestErrorPayload = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

// Build the diagnostic lines for a failure. The leading `HTTP <status> <code>`
// + mapped message + missing-secrets + PostgREST lines are shared; the duplicate
// profile line and the optional warnings/extras handling differ per surface and
// are supplied via config. Every returned line is redacted.
export function buildErrorLines<TDuplicate>(args: {
  status: number | null;
  code: string;
  mapFnError: (raw: string) => string;
  messages: Record<string, string>;
  missing?: string[];
  postgrestError?: PostgrestErrorPayload;
  duplicateProfileInfo?: TDuplicate;
  formatDuplicateLine?: (info: TDuplicate) => string;
  extras?: string[];
  warnings?: string[];
}): string[] {
  const lines: string[] = [];
  const statusLabel = args.status ?? "?";
  lines.push(`HTTP ${statusLabel} ${args.code}`);
  lines.push(args.mapFnError(args.code));
  if (args.missing && args.missing.length > 0) {
    lines.push(`Missing Edge Function secrets: ${args.missing.join(", ")}`);
  }
  if (args.postgrestError) {
    const pg = args.postgrestError;
    if (pg.code) lines.push(`PostgREST code: ${pg.code}`);
    if (pg.message) lines.push(`PostgREST message: ${pg.message}`);
    if (pg.details) lines.push(`PostgREST details: ${pg.details}`);
    if (pg.hint) lines.push(`PostgREST hint: ${pg.hint}`);
  }
  if (args.duplicateProfileInfo && args.formatDuplicateLine) {
    lines.push(args.formatDuplicateLine(args.duplicateProfileInfo));
  }
  if (args.warnings && args.warnings.length > 0) {
    for (const w of args.warnings) lines.push(`Warning: ${w}`);
  }
  if (args.extras && args.extras.length > 0) {
    for (const e of args.extras) {
      // Skip the bare repeat of the code token; we've already mapped it.
      if (e === args.code) continue;
      // Skip known token-only errors mapped above.
      if (args.messages[e]) continue;
      lines.push(e);
    }
  }
  return lines.map(redact);
}
