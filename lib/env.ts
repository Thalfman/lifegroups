// Typed, centralized environment access (#593). Required runtime vars are
// resolved and validated in ONE place so a misconfiguration fast-fails with a
// clear message naming the variable, instead of surfacing later as a cryptic
// null/undefined read far from the root cause.
//
// Supabase is OPTIONAL by design: with NO Supabase vars set, public preview /
// unauthenticated paths render typed demo data and protected routes redirect to
// `/login` (see README). So a fully-absent config returns `null` and degrades
// gracefully — the no-env build/run path is preserved. What fast-fails is a
// HALF-configured Supabase (a URL without a key, or a key without a URL) or a
// malformed URL — genuine misconfigurations that today get silently swallowed
// as "not configured".

export type SupabaseEnv = {
  url: string;
  key: string;
};

// The accepted aliases, most-specific first. Server-only names take precedence
// over their `NEXT_PUBLIC_` counterparts; publishable keys over the legacy anon
// keys.
const SUPABASE_URL_VARS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;

const SUPABASE_KEY_VARS = [
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

// The first non-empty (trimmed) value among `names`, or undefined if none set.
function firstSet(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

// Resolve and validate the Supabase connection env. Returns `null` when nothing
// is configured (intentional demo / no-env mode); throws a clear, named error
// when the config is half-present or the URL is malformed.
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = firstSet(SUPABASE_URL_VARS);
  const key = firstSet(SUPABASE_KEY_VARS);

  // Nothing configured → intentional demo / no-env mode.
  if (!url && !key) return null;

  // Half-configured → fast-fail naming the missing half, rather than silently
  // degrading to "not configured" with one secret already present.
  if (!url) {
    throw new Error(
      `Supabase is half-configured: a key is set but no URL. Set one of: ${SUPABASE_URL_VARS.join(
        ", "
      )}.`
    );
  }
  if (!key) {
    throw new Error(
      `Supabase is half-configured: a URL is set but no key. Set one of: ${SUPABASE_KEY_VARS.join(
        ", "
      )}.`
    );
  }

  // Both present → the URL must be a valid absolute URL.
  if (!URL.canParse(url)) {
    throw new Error(
      `Invalid Supabase URL (${SUPABASE_URL_VARS.join(
        " / "
      )}): ${JSON.stringify(url)} is not a valid URL.`
    );
  }

  return { url, key };
}

// Request-path resolver. Same resolution as `getSupabaseEnv`, but a
// misconfiguration (half-config or malformed URL) is LOGGED and treated as
// "not configured" (`null`) instead of thrown. The Supabase client and the
// session-refresh middleware run on essentially every request; letting the
// throw escape there would turn a one-variable misconfig into a site-wide 500
// — including `/login`, the page an operator needs to recover. So the request
// path degrades like the no-env demo mode, but the error message (which names
// the offending variable, per #593) still surfaces loudly in the server logs.
// The strict, throwing `getSupabaseEnv` stays for an explicit boot/build-time
// assertion that wants to fail hard.
export function getSupabaseEnvSafe(): SupabaseEnv | null {
  try {
    return getSupabaseEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[supabase] ignoring misconfigured environment: ${message}`);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnvSafe() !== null;
}

// The raw Supabase project URL (server-only name preferred), or undefined. Does
// NOT validate or throw — for tolerant consumers like the CSP layer that only
// need the origin and must never break a response on a misconfig.
export function getSupabaseUrlRaw(): string | undefined {
  return firstSet(SUPABASE_URL_VARS);
}
