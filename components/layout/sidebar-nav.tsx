"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AppShellNavItem } from "@/components/layout/shell";

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items }: { items: AppShellNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:mt-4 lg:flex-col lg:gap-0 lg:space-y-1 lg:overflow-visible lg:pb-0"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href);
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
