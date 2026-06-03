// Per-user "saved views & filters" persistence (Admin Interaction Model PRD
// req 12 / P2 polish, #263). The admin filter and view surfaces keep their
// selections in client state; this module is the small, framework-free core
// that lets those selections survive a reload or a return visit without any
// data-model change — the preferences live in the browser's localStorage,
// keyed per user so a shared machine keeps each admin's views apart.
//
// Only pure helpers live here (key building, safe parse, serialize) so they
// are unit-testable under the node test environment; the React wiring is the
// thin `usePersistedViewState` hook in lib/hooks.

const STORAGE_PREFIX = "lg:admin-view";

/**
 * Build the localStorage key for one surface's saved view, scoped to the
 * signed-in user. Scoping by profile id means two admins sharing a browser
 * each get their own remembered filters instead of inheriting the other's;
 * when no identity is available we fall back to a single shared bucket rather
 * than dropping persistence entirely.
 */
export function viewPreferenceKey(
  surface: string,
  scopeId: string | null | undefined
): string {
  const scope = scopeId && scopeId.length > 0 ? scopeId : "anon";
  return `${STORAGE_PREFIX}:${scope}:${surface}`;
}

/**
 * Parse a stored preference string and accept it only if it passes the
 * surface's own validator. Anything unparseable, corrupt, or shaped against an
 * older schema resolves to `null`, so the caller cleanly falls back to its
 * defaults instead of restoring junk into the UI.
 */
export function parseStoredPreference<T>(
  raw: string | null,
  validate: (value: unknown) => value is T
): T | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return validate(parsed) ? parsed : null;
}

/** Serialize a preference snapshot for storage. */
export function serializePreference<T>(value: T): string {
  return JSON.stringify(value);
}
