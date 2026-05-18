"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { P, fontBody } from "@/lib/pastoral";

export type ShellNavItem = { href: string; label: string };

function bestMatchHref(pathname: string | null, items: ShellNavItem[]): string | null {
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

export function ShellNav({ items }: { items: ShellNavItem[] }) {
  const pathname = usePathname();
  const activeHref = bestMatchHref(pathname, items);

  return (
    <nav
      aria-label="Primary"
      style={{
        display: "flex",
        gap: "clamp(18px, 3vw, 32px)",
        fontFamily: fontBody,
        fontSize: 14,
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={{
              color: active ? P.terra : P.ink2,
              fontWeight: active ? 600 : 400,
              fontStyle: active ? "normal" : "italic",
              borderBottom: active ? `1.5px solid ${P.terra}` : "1.5px solid transparent",
              paddingBottom: 18,
              marginBottom: -19,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
