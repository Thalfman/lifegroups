import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./config";
import type { AppSupabaseClient } from "./types";

export type ReadClient = AppSupabaseClient;

let memoizedClient: ReadClient | null = null;
let memoizedFor: string | null = null;

export function getReadClient(): ReadClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;

  const fingerprint = `${env.url}|${env.key}`;
  if (memoizedClient && memoizedFor === fingerprint) {
    return memoizedClient;
  }

  memoizedClient = createClient<Database>(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "lifegroups-dashboard" } },
  });
  memoizedFor = fingerprint;
  return memoizedClient;
}
