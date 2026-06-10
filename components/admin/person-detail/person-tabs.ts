// The person detail page's tab vocabulary, pure and client-safe so the shell,
// the harness, and tests share one source (the People/Multiply tab pattern).
//
// Which tabs exist depends on the person (issue #302 boundaries): Access is
// auth-backed login profiles only — members never sign in; Care is active
// leader / co-leader only — the care model is per-leader and the shepherd-care
// surface 404s inactive profiles.
export type PersonTabKey =
  | "overview"
  | "group"
  | "care"
  | "activity"
  | "access";

export function personTabsFor(args: {
  isLeader: boolean;
  isActive: boolean;
  isLoginBacked: boolean;
}): { key: PersonTabKey; label: string }[] {
  return [
    { key: "overview", label: "Overview" },
    { key: "group", label: "Group" },
    ...(args.isLeader && args.isActive
      ? [{ key: "care" as const, label: "Care" }]
      : []),
    { key: "activity", label: "Activity" },
    ...(args.isLoginBacked
      ? [{ key: "access" as const, label: "Access" }]
      : []),
  ];
}

// Resolve a raw `?tab=` value against the person's *visible* tabs, so a link
// to a leader's `?tab=care` opened on a member (or any unknown value)
// degrades to the Overview instead of selecting a tab that isn't there.
export function resolvePersonTab(
  raw: string | null | undefined,
  visible: readonly { key: PersonTabKey }[]
): PersonTabKey {
  const match = visible.find((t) => t.key === raw);
  return match ? match.key : "overview";
}
