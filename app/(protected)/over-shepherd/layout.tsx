import type { ReactNode } from "react";
import { requireOverShepherd } from "@/lib/auth/session";

// Over-Shepherd route-group guard per
// docs/adr/0002-oversight-ladder-and-leader-gating.md. Guarding the whole
// /over-shepherd/** group in one place admits only the over_shepherd role:
// admins, leaders, staff_viewer and anonymous callers are all redirected
// (to /unauthorized or /login) before any child page renders. The matching
// guard ensures over_shepherd cannot reach /admin/* or /leader/*, whose
// guards never list it.
export default async function OverShepherdLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireOverShepherd();
  return <>{children}</>;
}
