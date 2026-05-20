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
import { P, fontBody, fontSans } from "@/lib/pastoral";

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
      <nav
        aria-label="Primary"
        className="lg-m-nav-desktop"
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

      <button
        type="button"
        className="lg-m-nav-trigger"
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        style={{
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          padding: 0,
          borderRadius: 8,
          background: P.surface,
          border: `1px solid ${P.line}`,
          color: P.ink,
          cursor: "pointer",
        }}
      >
        <HamburgerIcon />
      </button>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPortal>
          <DialogOverlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(58, 42, 26, 0.45)",
              zIndex: 60,
            }}
          />
          <DialogContent
            aria-describedby={undefined}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              bottom: 0,
              height: "100vh",
              width: "min(320px, 86vw)",
              background: P.bg,
              borderRight: `1px solid ${P.line}`,
              borderRadius: 0,
              padding: 0,
              zIndex: 61,
              boxShadow: "0 18px 48px rgba(58, 42, 26, 0.2)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <header
              style={{
                padding: "16px 18px",
                borderBottom: `1px solid ${P.line}`,
                background: P.surface,
              }}
            >
              <DialogTitle
                style={{
                  fontFamily: fontSans,
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: P.ink3,
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                Menu
              </DialogTitle>
            </header>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                background: P.bg,
              }}
            >
              <ul
                className="lg-m-nav-drawer-list"
                style={{
                  listStyle: "none",
                  padding: 8,
                  margin: 0,
                  display: "grid",
                  gap: 4,
                }}
              >
                {items.map((item) => {
                  const active = item.href === activeHref;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setDrawerOpen(false)}
                        className="lg-m-nav-drawer-link"
                        style={{
                          display: "block",
                          padding: "14px 16px",
                          borderRadius: 10,
                          fontFamily: fontBody,
                          fontSize: 16,
                          textDecoration: "none",
                          color: active ? P.terra : P.ink,
                          background: active ? P.terraSoft : "transparent",
                          fontWeight: active ? 600 : 500,
                          border: active
                            ? `1px solid ${P.terra}`
                            : `1px solid transparent`,
                        }}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            {(mobileUser || mobileSignOut) && (
              <footer
                style={{
                  borderTop: `1px solid ${P.line}`,
                  background: P.surface,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
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
