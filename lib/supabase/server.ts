import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseEnvSafe } from "./config";
import type { AppSupabaseClient } from "./types";

export async function createSupabaseServerClient(): Promise<AppSupabaseClient | null> {
  // Misconfig degrades to null (reads fall back to demo data / null client)
  // rather than throwing mid-render; the misconfig is logged by the resolver.
  const env = getSupabaseEnvSafe();
  if (!env) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // RSC reads can't mutate cookies; middleware refreshes the session.
        }
      },
    },
  });
}
