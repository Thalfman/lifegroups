import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./config";

export type ReadClient = SupabaseClient<Database>;

let memoizedClient: ReadClient | null = null;
let memoizedFor: string | null = null;

export function getReadClient(): ReadClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;

  const fingerprint = `${env.url}|${env.anonKey}`;
  if (memoizedClient && memoizedFor === fingerprint) {
    return memoizedClient;
  }

  memoizedClient = createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "lifegroups-dashboard" } },
  });
  memoizedFor = fingerprint;
  return memoizedClient;
}
