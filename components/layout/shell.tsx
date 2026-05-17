import type { ReactNode } from "react";
import { SidebarNav } from "@/components/layout/sidebar-nav";

export type AppShellNavItem = { href: string; label: string };

export const PUBLIC_NAV_ITEMS: AppShellNavItem[] = [
  { href: "/", label: "Home" },
  { href: "/admin-preview", label: "Admin Preview" },
  { href: "/leader-preview", label: "Leader Preview" },
];

export function AppShell({
  title,
  subtitle,
  phaseLabel,
  headerSlot,
  navItems = PUBLIC_NAV_ITEMS,
  children,
}: {
  title: string;
  subtitle: string;
  phaseLabel?: string;
  headerSlot?: ReactNode;
  navItems?: AppShellNavItem[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted/40">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to content
      </a>
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:gap-6 sm:py-6 md:px-8 md:py-8 lg:grid-cols-[240px_1fr]">
        <aside className="surface-subtle h-fit p-3 sm:p-4 lg:sticky lg:top-6">
          <p className="px-1 text-sm font-semibold tracking-tight lg:px-0">Life Group Ops</p>
          <SidebarNav items={navItems} />
        </aside>
        <main id="main" className="space-y-5 sm:space-y-6">
          <header className="surface-subtle p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
              <div className="min-w-0">
                {phaseLabel ? (
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {phaseLabel}
                  </p>
                ) : null}
                <h1 className={`text-2xl font-semibold md:text-3xl ${phaseLabel ? "mt-2" : ""}`}>
                  {title}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
              </div>
              {headerSlot ? (
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">{headerSlot}</div>
              ) : null}
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
