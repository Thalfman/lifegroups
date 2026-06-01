import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { hubTilesForRole } from "@/lib/auth/hub-tiles";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { HomeHub } from "@/components/home/home-hub";
import { SignInScreen } from "@/components/sign-in/sign-in-screen";
import {
  parseSignInSearchParams,
  type SignInSearchParams,
} from "./login/next-path";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: SignInSearchParams;
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
        const tiles = hubTilesForRole(session.profile.role);
        if (tiles.length === 0) redirect("/unauthorized");
        return (
          <LgAppShell
            user={{
              name: session.profile.full_name,
              email: session.profile.email,
              role: session.profile.role,
            }}
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
    case "anonymous":
      // fall through to render the sign-in screen below
      break;
  }

  const { next, resetOk } = await parseSignInSearchParams(searchParams);
  return <SignInScreen next={next} resetOk={resetOk} />;
}
