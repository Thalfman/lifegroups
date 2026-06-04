"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../Icon";
import { Wordmark } from "./Wordmark";
import { Verse } from "./Verse";
import { NavLinkStatus } from "./NavLinkStatus";
import type { AdminNavGroup } from "@/lib/auth/roles";
import { isActiveNavHref } from "@/lib/nav/active-nav";

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
      className={asDrawer ? undefined : "lg-shell-sidebar"}
      style={{
        width: 232,
        flexShrink: 0,
        background: "var(--c-sidebar)",
        borderRight: asDrawer ? "none" : "1px solid var(--c-line)",
        padding: "22px 16px 16px",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-body)",
        minHeight: asDrawer ? "100vh" : undefined,
        height: "100vh",
        position: asDrawer ? "static" : "sticky",
        top: 0,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          padding: "0 6px 24px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Wordmark href={homeHref} />
      </div>

      <nav
        aria-label={navLabel}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {navGroups.map((g) => (
          <div key={g.group}>
            {g.label ? (
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 1.8,
                  textTransform: "uppercase",
                  color: "var(--c-ink4)",
                  padding: "6px 10px",
                  fontWeight: 600,
                }}
              >
                {g.label}
              </div>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: active ? "var(--c-surface)" : "transparent",
                      border: `1px solid ${active ? "var(--c-line)" : "transparent"}`,
                      color: active ? "var(--c-ink)" : "var(--c-ink2)",
                      fontSize: 13.5,
                      fontWeight: active ? 600 : 500,
                      textDecoration: "none",
                      fontFamily: "var(--font-body)",
                    }}
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

      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <Verse />
      </div>
    </aside>
  );
}
