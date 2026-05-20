"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../Icon";
import { Wordmark } from "./Wordmark";
import { Verse } from "./Verse";
import type { AdminNavGroup } from "@/lib/auth/roles";

function isActiveHref(currentPath: string, href: string): boolean {
  if (href === "/admin") return currentPath === "/admin";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function Sidebar({
  navGroups,
  onNavigate,
  asDrawer = false,
}: {
  navGroups: AdminNavGroup[];
  onNavigate?: () => void;
  asDrawer?: boolean;
}) {
  const pathname = usePathname() ?? "";

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
        height: asDrawer ? "100vh" : "100vh",
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
        <Wordmark />
      </div>

      <nav
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
                const active = isActiveHref(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
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
