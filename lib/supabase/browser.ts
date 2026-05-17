import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./config";
import type { AppSupabaseClient } from "./types";

export function createSupabaseBrowserClient(): AppSupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createBrowserClient<Database>(env.url, env.key);
}
