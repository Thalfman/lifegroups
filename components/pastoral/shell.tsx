import Link from "next/link";
import type { ReactNode } from "react";
import { P, fontBody, fontDisplay, fontSans, paperGrain } from "@/lib/pastoral";
import { PSeal, POrnament } from "@/components/pastoral/atoms";
import { ShellNav, type ShellNavItem } from "@/components/pastoral/shell-nav";

export type PastoralShellNavItem = ShellNavItem;

export function PastoralAppShell({
  navItems,
  eyebrow,
  title,
  titleItalic,
  lede,
  actions,
  headerSlot,
  children,
  contentMaxWidth = 1240,
  contentPad = "36px 36px",
}: {
  navItems?: PastoralShellNavItem[];
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleItalic?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  headerSlot?: ReactNode;
  children: ReactNode;
  contentMaxWidth?: number;
  contentPad?: string;
}) {
  return (
    <div
      style={{
        background: P.bg,
        minHeight: "100vh",
        fontFamily: fontBody,
        color: P.ink,
        position: "relative",
      }}
    >
      <div aria-hidden="true" style={paperGrain} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <header
        style={{
          padding: "18px 36px",
          background: P.surface,
          borderBottom: `1px solid ${P.line}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          flexWrap: "wrap",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <PSeal />
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 16,
              fontWeight: 600,
              color: P.ink,
            }}
          >
            Fox Valley ·{" "}
            <span style={{ fontStyle: "italic", color: P.ink2, fontWeight: 400 }}>
              Life Groups
            </span>
          </div>
        </Link>

        {navItems && navItems.length > 1 ? (
          <ShellNav items={navItems} />
        ) : (
          <div />
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
          }}
        >
          {headerSlot}
        </div>
      </header>

      <main
        id="main"
        style={{
          padding: contentPad,
          maxWidth: contentMaxWidth,
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        {(title || titleItalic || eyebrow || lede || actions) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: 20,
              marginBottom: 32,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <POrnament w={80} />
              {eyebrow ? (
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 11,
                    letterSpacing: 2.2,
                    textTransform: "uppercase",
                    color: P.ink3,
                    fontWeight: 600,
                    margin: "14px 0 8px",
                  }}
                >
                  {eyebrow}
                </div>
              ) : null}
              {(title || titleItalic) && (
                <h1
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: "clamp(34px, 5vw, 54px)",
                    margin: 0,
                    fontWeight: 500,
                    letterSpacing: "-0.025em",
                    lineHeight: 1.02,
                    color: P.ink,
                  }}
                >
                  {title}
                  {titleItalic ? (
                    <>
                      {title ? " " : null}
                      <span style={{ fontStyle: "italic", color: P.terra }}>
                        {titleItalic}
                      </span>
                    </>
                  ) : null}
                </h1>
              )}
              {lede ? (
                <p
                  style={{
                    fontFamily: fontBody,
                    fontSize: 16,
                    color: P.ink2,
                    margin: "14px 0 0",
                    maxWidth: 600,
                    lineHeight: 1.55,
                  }}
                >
                  {lede}
                </p>
              ) : null}
            </div>
            {actions ? (
              <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
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
