import { Suspense, type ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  defaultLandingPathForRole,
  navGroupsForRole,
  type UserRole,
} from "@/lib/auth/roles";
import { Sidebar } from "./Sidebar";
import { MobileSidebarTrigger } from "./MobileSidebar";
import { TopBar } from "./TopBar";

type HiddenNavAreas = ReadonlySet<string>;

export function LgAppShell({
  user,
  children,
  hiddenNavAreas,
}: {
  user: { name: string; email: string | null; role: UserRole };
  children: ReactNode;
  // Top-level area hrefs hidden from nav (ADR 0016), resolved from the Super
  // Admin nav-visibility flags by the admin-context caller. Two shapes:
  //  - a resolved ReadonlySet (or omitted) for non-admin callers / synchronous
  //    use — rendered immediately, exactly as before;
  //  - a Promise the admin layout passes UNawaited, so the nav-visibility RPC no
  //    longer sits on the shell's first-paint path. The frame, top bar, and main
  //    content stream right away and the sidebar's nav items fill in when the
  //    flag resolves. The Suspense fallback shows the ADR 0016 fail-safe default
  //    (Groups/People/Planning hidden), so an optional tab can only ever be
  //    revealed once proven shown — a retired tab never flashes.
  hiddenNavAreas?: HiddenNavAreas | Promise<HiddenNavAreas>;
}) {
  // Role-aware brand target: admins land on /admin (unchanged), over_shepherd
  // on /over-shepherd. Linking the wordmark to /admin for an over_shepherd
  // would bounce them to /unauthorized.
  const homeHref = defaultLandingPathForRole(user.role);
  const streaming = hiddenNavAreas instanceof Promise;

  // Fail-safe default nav (all optional tabs hidden) — used as the streaming
  // fallback and as the final nav whenever the caller resolved the set itself.
  const fallbackNavGroups = navGroupsForRole(user.role, undefined);

  const sidebar = streaming ? (
    <Suspense
      fallback={<Sidebar navGroups={fallbackNavGroups} homeHref={homeHref} />}
    >
      <ResolvedSidebar
        role={user.role}
        homeHref={homeHref}
        hiddenNavAreas={hiddenNavAreas}
      />
    </Suspense>
  ) : (
    <Sidebar
      navGroups={navGroupsForRole(user.role, hiddenNavAreas)}
      homeHref={homeHref}
    />
  );

  const mobileTrigger = streaming ? (
    <Suspense
      fallback={
        <MobileSidebarTrigger
          navGroups={fallbackNavGroups}
          homeHref={homeHref}
        />
      }
    >
      <ResolvedMobileTrigger
        role={user.role}
        homeHref={homeHref}
        hiddenNavAreas={hiddenNavAreas}
      />
    </Suspense>
  ) : (
    <MobileSidebarTrigger
      navGroups={navGroupsForRole(user.role, hiddenNavAreas)}
      homeHref={homeHref}
    />
  );

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg font-sans text-ink md:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:ring-sage"
      >
        Skip to content
      </a>
      {sidebar}
      <div className="flex min-w-0 flex-col">
        <TopBar
          user={user}
          mobileTrigger={mobileTrigger}
          signOutSlot={<LogoutButton className="" />}
        />
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

// Async nav slots: await the nav-visibility promise off the first-paint path and
// resolve the role's nav groups once it settles. Both await the SAME promise
// instance the layout created, so the underlying React.cache-wrapped RPC runs
// exactly once for the whole shell.
async function ResolvedSidebar({
  role,
  homeHref,
  hiddenNavAreas,
}: {
  role: UserRole;
  homeHref: string;
  hiddenNavAreas: Promise<HiddenNavAreas>;
}) {
  const resolved = await hiddenNavAreas;
  return (
    <Sidebar navGroups={navGroupsForRole(role, resolved)} homeHref={homeHref} />
  );
}

async function ResolvedMobileTrigger({
  role,
  homeHref,
  hiddenNavAreas,
}: {
  role: UserRole;
  homeHref: string;
  hiddenNavAreas: Promise<HiddenNavAreas>;
}) {
  const resolved = await hiddenNavAreas;
  return (
    <MobileSidebarTrigger
      navGroups={navGroupsForRole(role, resolved)}
      homeHref={homeHref}
    />
  );
}
