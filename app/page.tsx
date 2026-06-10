import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { namePendingRedirectTarget } from "@/lib/auth/name-pending";
import { hubTilesForRole } from "@/lib/auth/hub-tiles";
import { isAdminRole } from "@/lib/auth/roles";
import { loadHiddenNavAreas } from "@/lib/nav/hidden-nav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadHubStats, type HubStat } from "@/lib/home/hub-stats";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { HomeHub } from "@/components/home/home-hub";
import { isSafeNextPath } from "./login/next-path";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    reset?: string | string[];
  }>;
}) {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "authenticated": {
      // Choose-your-name gate (ADR 0025). The Home Hub sits outside the
      // (protected) layout, so it carries its own copy of the redirect.
      const nameGate = namePendingRedirectTarget(session);
      if (nameGate) redirect(nameGate);
      if (session.profile.status === "active") {
        // The Home Hub replaces the straight-to-/admin redirect (#158): land
        // signed-in active users on a tier-adapted tile launcher instead of
        // dropping them into the admin operating system. No-access roles
        // resolve to an empty tile set (hubTilesForRole) and still route to
        // /unauthorized rather than seeing an empty hub.
        // Admins see the Care/Plan/Multiply tile set with their Super-Admin
        // nav-visibility flags applied (ADR 0016); non-admin roles ignore the
        // hidden set, so only resolve it (a DB read) for admins. Admins also get
        // a small band of at-a-glance live stats above the tiles (CONTEXT.md);
        // both resolve in one parallel round. The stats reader is resilient —
        // a failed read just omits its figure, never a warning — so the hub
        // still renders cleanly if a stat can't load.
        const isAdmin = isAdminRole(session.profile.role);
        let hiddenNavAreas:
          | Awaited<ReturnType<typeof loadHiddenNavAreas>>
          | undefined;
        let hubStats: HubStat[] = [];
        if (isAdmin) {
          const client = await createSupabaseServerClient();
          const [hidden, stats] = await Promise.all([
            loadHiddenNavAreas(),
            client ? loadHubStats(client) : Promise.resolve<HubStat[]>([]),
          ]);
          hiddenNavAreas = hidden;
          hubStats = stats;
        }
        const tiles = hubTilesForRole(session.profile.role, hiddenNavAreas);
        if (tiles.length === 0) redirect("/unauthorized");
        return (
          <LgAppShell
            user={{
              name: session.profile.full_name,
              email: session.profile.email,
              role: session.profile.role,
            }}
            hiddenNavAreas={hiddenNavAreas}
          >
            <PageHeader
              eyebrow="Home"
              title={`Welcome, ${session.profile.full_name}`}
              lede={
                isAdmin
                  ? "Your ministry at a glance — then jump into Care, Plan, or Multiply."
                  : "Jump into your work."
              }
            />
            <PageBody>
              <HomeHub tiles={tiles} stats={hubStats} />
            </PageBody>
          </LgAppShell>
        );
      }
      redirect("/unauthorized");
    }
    case "profile_missing":
      redirect("/unauthorized");
    case "backend_error":
      redirect("/unauthorized?reason=unavailable");
    case "anonymous": {
      // Anonymous visitors are normally served the static /login document via a
      // middleware rewrite (the URL stays at "/"), so this branch is only a
      // fallback for requests that bypass middleware (e.g. no Supabase env). It
      // routes to the same statically-generated sign-in page, forwarding the
      // validated next/reset params so a deep link like /?next=/admin survives
      // even on the fallback path (the rewrite preserves them automatically).
      const params = await searchParams;
      const nextRaw = Array.isArray(params.next) ? params.next[0] : params.next;
      const resetRaw = Array.isArray(params.reset)
        ? params.reset[0]
        : params.reset;
      const query = new URLSearchParams();
      if (nextRaw && isSafeNextPath(nextRaw)) query.set("next", nextRaw);
      if (resetRaw === "ok") query.set("reset", "ok");
      const qs = query.toString();
      redirect(qs ? `/login?${qs}` : "/login");
    }
  }
}
