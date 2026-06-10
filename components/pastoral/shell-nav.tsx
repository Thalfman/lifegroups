"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ShellNavItem = { href: string; label: string };

function bestMatchHref(
  pathname: string | null,
  items: ShellNavItem[]
): string | null {
  if (!pathname) return null;
  let bestHref: string | null = null;
  let bestScore = -1;
  for (const item of items) {
    let score = -1;
    if (item.href === "/") {
      if (pathname === "/") score = 1;
    } else if (pathname === item.href) {
      score = item.href.length + 1;
    } else if (pathname.startsWith(`${item.href}/`)) {
      score = item.href.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestHref = item.href;
    }
  }
  return bestHref;
}

export function ShellNav({
  items,
  mobileUser,
  mobileSignOut,
}: {
  items: ShellNavItem[];
  mobileUser?: ReactNode;
  mobileSignOut?: ReactNode;
}) {
  const pathname = usePathname();
  const activeHref = bestMatchHref(pathname, items);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <Fragment>
      {/* Desktop rail (was .lg-m-nav-desktop): hidden on mobile, where the
          drawer trigger takes over. */}
      <nav
        aria-label="Primary"
        className="hidden flex-wrap justify-center gap-5 font-sans text-base lg:gap-8 md:flex"
      >
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-[19px] whitespace-nowrap border-b-[1.5px] pb-[18px] no-underline",
                active
                  ? "border-clay font-semibold text-clay"
                  : "border-transparent font-normal italic text-ink2"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile drawer trigger (was .lg-m-nav-trigger). */}
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-line bg-surface p-0 text-ink md:hidden"
      >
        <HamburgerIcon />
      </button>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPortal>
          {/* Warm scrim — ink at 45%. */}
          <DialogOverlay className="fixed inset-0 z-overlay bg-ink/45" />
          {/* 100dvh respects dynamic browser chrome (iOS Safari, Chrome
              Android toolbars) so the drawer footer stays reachable. */}
          <DialogContent
            aria-describedby={undefined}
            className="fixed bottom-0 left-0 top-0 z-drawer flex h-dvh w-[min(320px,86vw)] flex-col overflow-hidden rounded-none border-r border-line bg-bg p-0 shadow-softLg"
          >
            <header className="border-b border-line bg-surface px-[18px] py-4">
              <DialogTitle className="m-0 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-ink3">
                Menu
              </DialogTitle>
            </header>

            <div className="flex-1 overflow-y-auto bg-bg">
              <ul className="m-0 grid list-none gap-1 p-2">
                {items.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setDrawerOpen(false)}
                        className={cn(
                          "block rounded-sm border px-4 py-3.5 font-sans text-md no-underline",
                          active
                            ? "border-clay bg-claySoft font-semibold text-clay"
                            : "border-transparent font-medium text-ink"
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {(mobileUser || mobileSignOut) && (
              <footer className="flex flex-col gap-3 border-t border-line bg-surface p-4">
                {mobileUser ? <div>{mobileUser}</div> : null}
                {mobileSignOut ? <div>{mobileSignOut}</div> : null}
              </footer>
            )}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </Fragment>
  );
}

function HamburgerIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 5h14M3 10h14M3 15h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
