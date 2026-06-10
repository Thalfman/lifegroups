"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../Icon";
import { Wordmark } from "./Wordmark";
import { Verse } from "./Verse";
import { NavLinkStatus } from "./NavLinkStatus";
import type { AdminNavGroup } from "@/lib/auth/roles";
import { isActiveNavHref } from "@/lib/nav/active-nav";
import { cn } from "@/lib/utils";

export function Sidebar({
  navGroups,
  onNavigate,
  asDrawer = false,
  homeHref = "/admin",
  activePath,
  navLabel = "Primary",
}: {
  navGroups: AdminNavGroup[];
  onNavigate?: () => void;
  asDrawer?: boolean;
  // Where the brand/wordmark links. Role-aware so an over_shepherd (who cannot
  // reach /admin) lands on their own home instead of /unauthorized.
  homeHref?: string;
  // Override the path used for active-state resolution. Defaults to the live
  // `usePathname()`; supplied only by the a11y harness so a Playwright spec can
  // assert aria-current against frozen alias URLs the harness can't navigate to.
  activePath?: string;
  // Accessible name for the primary <nav> landmark. Defaults to "Primary"
  // (one sidebar per page in production). The harness renders several sidebars
  // at once and passes a distinct label each so axe's landmark-unique rule and
  // assistive tech can tell them apart.
  navLabel?: string;
}) {
  const livePathname = usePathname() ?? "";
  const pathname = activePath ?? livePathname;

  return (
    <aside
      className={cn(
        "h-screen w-[232px] shrink-0 flex-col overflow-y-auto bg-sidebar px-4 pb-4 pt-[22px] font-sans",
        asDrawer
          ? "flex min-h-screen"
          : "sticky top-0 hidden border-r border-line md:flex"
      )}
    >
      <div className="flex items-center gap-2.5 px-1.5 pb-6">
        <Wordmark href={homeHref} />
      </div>

      <nav aria-label={navLabel} className="flex flex-col gap-3.5">
        {navGroups.map((g) => (
          <div key={g.group}>
            {g.label ? (
              <div className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.16em] text-ink3">
                {g.label}
              </div>
            ) : null}
            <div className="flex flex-col gap-px">
              {g.items.map((item) => {
                const active = isActiveNavHref(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    // Full prefetch (not the default shell-only prefetch for
                    // dynamic routes): warms each tab's complete RSC payload —
                    // data included — while the link sits idle in the viewport,
                    // so a sidebar click renders from cache instantly with no
                    // skeleton flash. Paired with the lengthened `staleTimes`
                    // window in next.config.ts to throttle re-prefetching.
                    prefetch={true}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-9 items-center gap-2.5 rounded-sm border px-2.5 py-2 text-base font-medium no-underline transition-colors duration-150",
                      active
                        ? "border-line bg-surface font-semibold text-ink"
                        : "border-transparent text-ink2 hover:bg-surface/60"
                    )}
                  >
                    <Icon
                      name={item.icon as IconName}
                      size={16}
                      color={active ? "var(--c-sageDeep)" : "var(--c-ink3)"}
                    />
                    {item.label}
                    <NavLinkStatus />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* The verse is brand, not decoration — it stays at the sidebar foot. */}
      <div className="mt-auto pt-4">
        <Verse />
      </div>
    </aside>
  );
}
