import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { e2eDbEnv, type E2eAuditEventRow, type E2eDbEnv } from "./db";

// Authenticated (RLS-subject) DB reads for the E2E process. Fixture setup may
// use tests/e2e/db.ts's local-only service client, but assertions that a real
// oversight tier can read a row should come through this publishable-key client.

type AuthenticatedE2eDbEnv = E2eDbEnv & {
  readonly publishableKey: string;
};

export function authenticatedE2eDbEnv(): AuthenticatedE2eDbEnv | null {
  const base = e2eDbEnv();
  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
  ).trim();
  if (!base || !publishableKey) return null;
  return { ...base, publishableKey };
}

/** Return a local-stack client carrying a real Auth JWT and subject to RLS. */
export async function signInE2eUser(
  email: string,
  password: string
): Promise<SupabaseClient> {
  const env = authenticatedE2eDbEnv();
  if (!env) {
    throw new Error(
      "Authenticated E2E DB env not configured (run through scripts/e2e.sh)."
    );
  }
  const client = createClient(env.supabaseUrl, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Supabase constructs Realtime eagerly. Node 20 needs an explicit WebSocket
    // transport even though these read-back clients never open a channel.
    realtime: { transport: ws as unknown as WebSocketLikeConstructor },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`E2E DB sign-in failed for ${email}: ${error.message}`);
  }
  return client;
}

const AUDIT_EVENT_SELECT =
  "id, actor_profile_id, action, entity_type, entity_id, metadata, " +
  "created_at, actor_name, actor_email";

/** Read one run's audit rows through the supplied authenticated client. */
export async function fetchAuditEventsAs(
  client: SupabaseClient,
  filter: { action: string; entityId: string; since: string }
): Promise<E2eAuditEventRow[]> {
  const { data, error } = await client
    .from("audit_events")
    .select(AUDIT_EVENT_SELECT)
    .eq("action", filter.action)
    .eq("entity_id", filter.entityId)
    .gte("created_at", filter.since)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<E2eAuditEventRow[]>();
  if (error) {
    throw new Error(
      `authenticated audit_events read failed for '${filter.action}': ${error.message}`
    );
  }
  return data ?? [];
}
