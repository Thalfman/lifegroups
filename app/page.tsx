import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { hubTilesForRole } from "@/lib/auth/hub-tiles";
import { isAdminRole } from "@/lib/auth/roles";
import { loadHiddenNavAreas } from "@/lib/nav/hidden-nav";
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
    case "authenticated":
      if (session.profile.status === "active") {
        // The Home Hub replaces the straight-to-/admin redirect (#158): land
        // signed-in active users on a tier-adapted tile launcher instead of
        // dropping them into the admin operating system. No-access roles
        // resolve to an empty tile set (hubTilesForRole) and still route to
        // /unauthorized rather than seeing an empty hub.
        // Admins see the Care/Plan/Multiply tile set with their Super-Admin
        // nav-visibility flags applied (ADR 0016); non-admin roles ignore the
        // hidden set, so only resolve it (a DB read) for admins.
        const hiddenNavAreas = isAdminRole(session.profile.role)
          ? await loadHiddenNavAreas()
          : undefined;
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
              lede="Jump into your work."
            />
            <PageBody>
              <HomeHub tiles={tiles} />
            </PageBody>
          </LgAppShell>
        );
      }
      redirect("/unauthorized");
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
