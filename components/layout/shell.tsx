import Link from "next/link";
import type { ReactNode } from "react";

export type AppShellNavItem = { href: string; label: string };

export const PUBLIC_NAV_ITEMS: AppShellNavItem[] = [
  { href: "/", label: "Home" },
  { href: "/admin-preview", label: "Admin Preview" },
  { href: "/leader-preview", label: "Leader Preview" },
];

export function AppShell({
  title,
  subtitle,
  phaseLabel = "Phase 4",
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
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:px-8 md:py-8 lg:grid-cols-[240px_1fr]">
        <aside className="surface-subtle h-fit p-4">
          <p className="text-sm font-semibold">Life Group Ops</p>
          <nav className="mt-4 space-y-1">
            {navItems.map((item) => (
              <Link
                className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-background hover:text-foreground"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="space-y-6">
          <header className="surface-subtle p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{phaseLabel}</p>
                <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{title}</h1>
                <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
              </div>
              {headerSlot ? <div className="flex flex-wrap items-center gap-3">{headerSlot}</div> : null}
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
