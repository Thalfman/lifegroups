import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { IntegrationEnv } from "./env";

// Supabase client factories for the integration harness.
//
// Two kinds of client:
//   * the SERVICE client (service-role key) — bypasses RLS, used ONLY to
//     provision and tear down fixtures. Harness-only; never an app runtime path.
//   * a TIER client (anon key + an Auth-issued session) — subject to RLS exactly
//     as the running app would be. Exercising RLS as each tier is the whole point.

/**
 * The service-role client. It bypasses RLS, so it is the fixture-provisioning
 * tool only — every visibility assertion runs through a {@link signInTier}
 * client instead.
 */
export function makeServiceClient(env: IntegrationEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Sign a tier in with email + password and return a client carrying that
 * Auth-issued JWT. Reads/writes through this client hit real RLS and the
 * `auth.uid()` / `auth_*()` predicates the policies depend on.
 */
export async function signInTier(
  env: IntegrationEnv,
  email: string,
  password: string
): Promise<SupabaseClient> {
  const client = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`sign-in failed for ${email}: ${error.message}`);
  }
  return client;
}
