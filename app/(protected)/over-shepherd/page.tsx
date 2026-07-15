import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { AddToHomeScreenButton } from "@/components/pwa/add-to-home-screen-button";
import { EmptyState } from "@/components/dashboard/cards";
import { MyShepherdsTable } from "@/components/over-shepherd/my-shepherds-table";
import { requireOverShepherd } from "@/lib/auth/session";
import { toShellUser } from "@/lib/auth/shell-user";
import { OrientationPanel } from "@/components/orientation/orientation-panel";
import { loadOverShepherdData } from "@/lib/over-shepherd/over-shepherd-data";

export const dynamic = "force-dynamic";

// Over-Shepherd "My Shepherds" directory — read-only, row-scoped to the
// caller's active coverage (docs/adr/0002-oversight-ladder-and-leader-gating.md).
// Scope is resolved by the OS.2 coverage bridge; the underlying rows are also
// RLS-scoped. The admin-only admin_summary is never read on this path.
//
// The read-orchestration lives in buildOverShepherdData (ADR 0015); this page
// guards, loads, and switches on the result — the effects (redirect on
// no-access, the controlled empty state) stay here.
export default async function OverShepherdPage() {
  const session = await requireOverShepherd();
  const user = toShellUser(session.profile);

  const SHELL_MAX_WIDTH = 980;
  const shell = (lede: string, body: ReactNode) => (
    <LgAppShell user={user}>
      <PageHeader
        eyebrow="Over-Shepherd"
        title="My Shepherds"
        lede={lede}
        maxWidth={SHELL_MAX_WIDTH}
        actions={<AddToHomeScreenButton />}
      />
      <PageBody maxWidth={SHELL_MAX_WIDTH}>{body}</PageBody>
    </LgAppShell>
  );

  const data = await loadOverShepherdData();

  // A clean no-access resolution (zero or ambiguous roster match — see the
  // bridge-contract note in buildOverShepherdData) denies the surface.
  if (data.kind === "no_access") redirect("/unauthorized");

  // Either backend read failing — surface one controlled empty state rather
  // than leaking a 500.
  if (data.kind === "unavailable") {
    return shell(
      "We couldn't load your Shepherds just now.",
      <EmptyState
        title="Temporarily unavailable"
        description="Your care list couldn't be loaded. Please refresh in a moment."
      />
    );
  }

  return shell(
    data.lede,
    <>
      <OrientationPanel
        variant="over_shepherd"
        initiallySeen={data.orientationSeen}
      />
      <MyShepherdsTable entries={data.entries} />
    </>
  );
}
