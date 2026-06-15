// The Supabase config seam. Resolution + validation lives in the centralized,
// typed env module (`lib/env.ts`, #593) so there is one place that parses the
// connection vars and fast-fails on a misconfiguration. Kept as a thin re-export
// so the Supabase client modules (`server.ts`, `middleware.ts`) and CSP layer
// import a stable seam.
export type { SupabaseEnv } from "@/lib/env";
export {
  getSupabaseEnv,
  getSupabaseEnvSafe,
  isSupabaseConfigured,
} from "@/lib/env";
