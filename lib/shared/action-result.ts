// The write-result envelope and RPC-error matcher shared by every server-
// action surface (admin, leader, over-shepherd). Each surface supplies only
// its own token->message table and fallback copy; the result shape and the
// match-then-substring resolution live here once, so a change to either is
// fixed in one place rather than re-spelled per surface.
//
// Matches `lib/admin/validation.ts`'s ValidationResult on purpose so callers
// can thread validation failures and action failures through one UI path.

export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export function actionOk<T>(value: T): ActionResult<T> {
  return { ok: true, value };
}

export function actionFail(errors: string[]): ActionResult<never> {
  return { ok: false, errors };
}

// A surface's fixed RPC error tokens mapped to user-facing copy.
export type RpcErrorMessages = Record<string, string>;

// Build a surface's `mapRpcError`: resolve a raw PostgrestError.message to
// user-facing copy by exact token match first, then substring, then the
// surface's fallback. Returned bound to the table so each surface still
// exposes a one-argument `mapRpcError(raw)`.
export function makeRpcErrorMapper(
  messages: RpcErrorMessages,
  fallback: string
): (raw: string | undefined | null) => string {
  // Substring fallback tries longer tokens first: several tables carry a token
  // that is a prefix of a sibling (invalid_status / invalid_status_transition,
  // candidate_exists / type_candidate_exists), and insertion order would let
  // the short one shadow the long one in any wrapped message.
  const tokensLongestFirst = Object.keys(messages).sort(
    (a, b) => b.length - a.length
  );
  return (raw) => {
    if (!raw) return fallback;
    // Postgres surfaces a token-form message via PostgrestError.message with
    // nothing extra; match exactly first, then fall back to substring.
    if (messages[raw]) return messages[raw];
    for (const token of tokensLongestFirst) {
      if (raw.includes(token)) return messages[token];
    }
    return fallback;
  };
}
