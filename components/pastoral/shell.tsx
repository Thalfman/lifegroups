import Link from "next/link";
import type { ReactNode } from "react";
import { paperGrain } from "@/lib/pastoral";
import { PSeal, POrnament } from "@/components/pastoral/atoms";
import { ShellNav, type ShellNavItem } from "@/components/pastoral/shell-nav";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import type { UserRole } from "@/lib/auth/roles";

export type PastoralShellNavItem = ShellNavItem;

export function PastoralAppShell({
  navItems,
  eyebrow,
  title,
  titleItalic,
  lede,
  actions,
  headerSlot,
  currentUser,
  children,
  contentMaxWidth = 1240,
  contentPad,
}: {
  navItems?: PastoralShellNavItem[];
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleItalic?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  headerSlot?: ReactNode;
  // When provided, the mobile drawer renders a footer with the user identity
  // block + a sign-out button. Desktop header layout is unchanged.
  currentUser?: { name: string; email: string | null; role: UserRole };
  children: ReactNode;
  contentMaxWidth?: number;
  // Escape hatch for a caller that needs non-standard main padding; the
  // default rhythm (14/16 mobile → 36 desktop) comes from Tailwind classes.
  contentPad?: string;
}) {
  const mobileUser = currentUser ? (
    <UserPill
      name={currentUser.name}
      email={currentUser.email}
      role={currentUser.role}
      variant="drawer"
    />
  ) : null;
  const mobileSignOut = currentUser ? <LogoutButton className="" /> : null;

  return (
    <div className="lg-m-noscrollx relative min-h-screen bg-bg font-sans text-ink">
      <div aria-hidden="true" style={paperGrain} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:ring-sage"
      >
        Skip to content
      </a>

      <header className="relative z-base flex flex-nowrap items-center justify-between gap-2.5 border-b border-line bg-surface px-3.5 py-3 md:flex-wrap md:gap-6 md:px-9 md:py-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-3 text-inherit no-underline"
        >
          <PSeal />
          <div className="truncate font-display text-md font-medium text-ink md:text-lg">
            Fox Valley Church Life Groups
          </div>
        </Link>

        {navItems && navItems.length > 1 ? (
          <ShellNav
            items={navItems}
            mobileUser={mobileUser}
            mobileSignOut={mobileSignOut}
          />
        ) : (
          <div />
        )}

        <div className="flex items-center gap-3.5 font-sans text-sm text-ink2">
          {headerSlot}
        </div>
      </header>

      <main
        id="main"
        className="relative z-base mx-auto w-full px-3.5 py-4 md:p-9"
        style={{
          maxWidth: contentMaxWidth,
          ...(contentPad ? { padding: contentPad } : undefined),
        }}
      >
        {(title || titleItalic || eyebrow || lede || actions) && (
          <div className="mb-5 flex flex-col items-start gap-2.5 md:mb-8 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-5">
            <div className="min-w-0 flex-1">
              <POrnament w={80} />
              {eyebrow ? (
                /* The page kicker — the one tracked-uppercase voice per page. */
                <div className="mb-2 mt-3.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-ink3">
                  {eyebrow}
                </div>
              ) : null}
              {(title || titleItalic) && (
                <h1 className="m-0 font-display text-3xl font-normal text-ink md:text-4xl">
                  {title}
                  {titleItalic ? (
                    <>
                      {title ? " " : null}
                      <span className="italic text-clay">{titleItalic}</span>
                    </>
                  ) : null}
                </h1>
              )}
              {lede ? (
                <p className="mb-0 mt-3 max-w-lede font-sans text-base text-ink2">
                  {lede}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div className="flex w-full flex-wrap gap-2.5 md:w-auto md:shrink-0 [&>*]:flex-auto md:[&>*]:flex-none">
                {actions}
              </div>
            ) : null}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
