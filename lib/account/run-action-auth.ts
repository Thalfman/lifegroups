// Self-service authenticate seam for the shared Write Action Runner (ADR
// 0035). The welcome and account actions write the caller's OWN row via
// narrow SECURITY DEFINER RPCs, so they authenticate "any signed-in user"
// rather than a role gate — the RPC re-checks server-side. This helper is the
// one home for that check; the actions import the shared runner directly
// instead of growing a fourth per-surface adapter.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { FinishFields } from "@/lib/observability/instrument";

export type SelfServiceActor = { userId: string };

export function makeSelfServiceAuthenticate(opts: {
  // User-facing copy when Supabase env is absent on this deployment.
  notConfiguredError: string;
  // Invoked when there is no signed-in user, so the wrapper can redirect to
  // /login after the runner returns (`redirect()` throws, so it stays outside
  // the runner).
  onNoSession?: () => void;
  // Lets the account action reuse the authenticated client for its post-ok
  // sign-out teardown.
  captureClient?: (client: AppSupabaseClient) => void;
}): () => Promise<
  | { ok: true; actor: SelfServiceActor; baseFields: FinishFields }
  | { ok: false; error: string; code?: string }
> {
  return async () => {
    const client = await createSupabaseServerClient();
    if (!client) {
      return {
        ok: false,
        error: opts.notConfiguredError,
        code: "supabase_not_configured",
      };
    }
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) {
      opts.onNoSession?.();
      return { ok: false, error: "Sign in to continue.", code: "no_session" };
    }
    opts.captureClient?.(client);
    return { ok: true, actor: { userId: user.id }, baseFields: {} };
  };
}
