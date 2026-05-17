"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AppShellNavItem } from "@/components/layout/shell";

function bestMatchHref(pathname: string | null, items: AppShellNavItem[]): string | null {
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

export function SidebarNav({ items }: { items: AppShellNavItem[] }) {
  const pathname = usePathname();
  const activeHref = bestMatchHref(pathname, items);

  return (
    <nav
      aria-label="Primary"
      className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:mt-4 lg:flex-col lg:gap-0 lg:space-y-1 lg:overflow-visible lg:pb-0"
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors lg:shrink lg:whitespace-normal",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border lg:border-l-2 lg:border-primary lg:bg-background lg:ring-0"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
