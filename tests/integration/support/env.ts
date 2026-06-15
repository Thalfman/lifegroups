import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Environment + skip-guard for the RLS / action-pipeline integration harness
// (issue #607). This lane is OPT-IN: it only runs when a local Supabase CLI
// stack and its credentials are present. When anything is missing the specs
// SKIP cleanly (never fail), so the default lane and a credential-free checkout
// stay green.
//
// SECURITY: the service-role key here is used ONLY by the test harness to
// provision fixtures against a LOCAL stack. It is never imported into any app
// runtime path (`app/**`, `lib/**`, `proxy.ts`). The Next runtime keeps
// its no-service-role-key invariant; this is setup tooling, like
// scripts/seed-test-auth-users.ts.

/** Load `.env.local` (non-destructively) so a local run mirrors the seed scripts. */
function loadEnvLocal(cwd: string = process.cwd()): void {
  const path = resolve(cwd, ".env.local");
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.replace(/^export\s+/, "");
    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;
    const key = stripped.slice(0, eq).trim();
    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/** A resolved, ready-to-use integration environment. */
export interface IntegrationEnv {
  /** Local Supabase API URL (e.g. http://127.0.0.1:54321). */
  readonly supabaseUrl: string;
  /** Anon/publishable key — used to build the per-tier authenticated clients. */
  readonly anonKey: string;
  /** Service-role key — harness-only, for fixture provisioning. Never in app runtime. */
  readonly serviceRoleKey: string;
}

/**
 * The harness probes for credentials and either resolves them or explains why
 * it is skipping. A discriminated union keeps the call site honest: a
 * `skip` outcome carries a human-readable reason for `describe.skip`.
 */
export type IntegrationEnvResult =
  | { readonly kind: "ready"; readonly env: IntegrationEnv }
  | { readonly kind: "skip"; readonly reason: string };

function firstNonEmpty(...vars: Array<string | undefined>): string {
  for (const v of vars) {
    const trimmed = (v ?? "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function hostIsLocal(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Resolve the integration environment, or a skip reason. The harness is opt-in:
 * it requires `RUN_RLS_INTEGRATION=true` AND a reachable local Supabase URL +
 * an anon key + a service-role key. A remote/non-local Supabase URL is refused
 * (this lane must never touch a production project).
 */
export function resolveIntegrationEnv(): IntegrationEnvResult {
  loadEnvLocal();

  if ((process.env.RUN_RLS_INTEGRATION ?? "").trim() !== "true") {
    return {
      kind: "skip",
      reason:
        "RLS integration harness is opt-in; set RUN_RLS_INTEGRATION=true with a local Supabase CLI stack to run it.",
    };
  }

  const supabaseUrl = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL
  );
  const anonKey = firstNonEmpty(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY
  );
  const serviceRoleKey = firstNonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)");
  if (!anonKey)
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or anon key)");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  // We are PAST the opt-in gate: RUN_RLS_INTEGRATION=true means the operator
  // explicitly asked to exercise RLS (the scheduled/manual workflow). A missing
  // credential or a non-local URL here is a broken harness setup, NOT the
  // credential-free default lane — so FAIL loudly instead of skipping, which
  // would let the RLS workflow exit 0 (green) without exercising any RLS if
  // `supabase status` parsing drifts or a key goes unset.
  if (missing.length > 0) {
    throw new Error(
      `RLS integration harness is opted in (RUN_RLS_INTEGRATION=true) but ` +
        `misconfigured: missing ${missing.join(", ")}. Refusing to skip — fix ` +
        `the local stack/credentials or unset RUN_RLS_INTEGRATION.`
    );
  }

  if (!hostIsLocal(supabaseUrl)) {
    throw new Error(
      `RLS integration harness is opted in (RUN_RLS_INTEGRATION=true) but the ` +
        `Supabase URL '${supabaseUrl}' is not local. It only runs against a ` +
        `local CLI stack (localhost / 127.0.0.1); refusing to skip or to touch ` +
        `a non-local project.`
    );
  }

  return {
    kind: "ready",
    env: { supabaseUrl, anonKey, serviceRoleKey },
  };
}
