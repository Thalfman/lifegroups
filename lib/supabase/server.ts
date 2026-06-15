import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./config";
import type { AppSupabaseClient } from "./types";

export async function createSupabaseServerClient(): Promise<AppSupabaseClient | null> {
  // A configured-but-invalid env (half-config or malformed URL) throws here on
  // purpose: a broken deploy should surface loudly on the data routes that
  // reach this (an error boundary on that route), not masquerade as the
  // intentional no-database/demo mode. Only the all-absent case returns null —
  // the genuine demo path. Public preview routes never call this; they render
  // typed demo data without a client. (Middleware is the one exception that
  // must tolerate a misconfig — see lib/supabase/middleware.ts.)
  const env = getSupabaseEnv();
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
