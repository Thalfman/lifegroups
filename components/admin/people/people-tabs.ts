// The People surface's two destinations. Pure and client-safe so the shell,
// the server page, and tests share one resolver (the Multiply pattern:
// resolveMultiplyInitialTab in multiply-data).
export type PeopleTabKey = "directory" | "apprentices";

// Resolve a raw `?tab=` value against the canonical keys; anything unknown
// falls back to the Directory (the working view).
export function resolvePeopleTab(raw: string | null | undefined): PeopleTabKey {
  return raw === "apprentices" ? "apprentices" : "directory";
}
