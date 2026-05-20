import type { ReactNode } from "react";
import { fontBody, fontDisplay } from "@/lib/pastoral";
import {
  Sidebar,
  TopBar,
  sidebarForPersona,
  type SidebarItem,
} from "@/components/pastoral/sidebar";
import type { ShellNavItem } from "@/components/pastoral/shell-nav";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  availablePersonasForRole,
  type Persona,
  type UserRole,
} from "@/lib/auth/roles";

export type PastoralShellNavItem = ShellNavItem;

export function PastoralAppShell({
  persona,
  navItems: _navItems,
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
  persona?: Persona;
  // Legacy: kept for backwards-compatibility with the previous top-nav shell.
  // The new sidebar derives its items from `persona` + the user's role; this
  // prop is intentionally ignored. Eslint underscore-prefix signals the intent.
  navItems?: PastoralShellNavItem[];
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleItalic?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  headerSlot?: ReactNode;
  currentUser?: { name: string; email: string | null; role: UserRole };
  children: ReactNode;
  contentMaxWidth?: number;
  // Kept on the API for backwards-compatibility; not consumed by the new shell.
  contentPad?: string;
}) {
  void _navItems;
  void contentPad;

  const effectivePersona: Persona = persona ?? "admin";
  const role = currentUser?.role;
  const availablePersonas: Persona[] = role
    ? availablePersonasForRole(role)
    : [effectivePersona];
  const includeSuperAdmin = role === "super_admin";
  const sidebarItems: SidebarItem[] = sidebarForPersona(effectivePersona, {
    includeSuperAdmin,
  });

  const trailing = currentUser ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <UserPill
        name={currentUser.name}
        email={currentUser.email}
        role={currentUser.role}
      />
      <LogoutButton className="lg-m-signout-hide" />
    </div>
  ) : (
    headerSlot
  );

  return (
    <div
      className="lg-m-noscrollx"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--c-bg)",
        color: "var(--c-ink)",
        fontFamily: fontBody,
      }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>

      <Sidebar
        persona={effectivePersona}
        availablePersonas={availablePersonas}
        items={sidebarItems}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TopBar
          persona={effectivePersona}
          availablePersonas={availablePersonas}
          items={sidebarItems}
          currentUser={currentUser}
          trailing={trailing}
        />

        <main
          id="main"
          className="lg-m-shell-main"
          style={{
            flex: 1,
            overflow: "auto",
            background: "var(--c-bg)",
          }}
        >
          {(title || titleItalic || eyebrow || lede || actions) && (
            <PageHeader
              eyebrow={eyebrow}
              title={title}
              titleItalic={titleItalic}
              lede={lede}
              actions={actions}
              maxWidth={contentMaxWidth}
            />
          )}
          <PageBody maxWidth={contentMaxWidth}>{children}</PageBody>
        </main>
      </div>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  titleItalic,
  lede,
  actions,
  maxWidth,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleItalic?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  maxWidth: number;
}) {
  return (
    <div
      className="lg-m-shell-pageheader"
      style={{
        padding: "36px 40px 24px",
        maxWidth,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <div
        className="lg-m-shell-titlerow"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {eyebrow ? (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "var(--c-clay)",
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          {(title || titleItalic) && (
            <h1
              className="lg-m-shell-title"
              style={{
                margin: 0,
                fontFamily: fontDisplay,
                fontSize: "calc(38px * var(--font-scale))",
                lineHeight: 1.08,
                fontWeight: 400,
                color: "var(--c-ink)",
                letterSpacing: "-0.025em",
              }}
            >
              {title}
              {titleItalic ? (
                <>
                  {title ? " " : null}
                  <span style={{ fontStyle: "italic", color: "var(--c-ink2)" }}>
                    {titleItalic}
                  </span>
                </>
              ) : null}
            </h1>
          )}
          {lede ? (
            <p
              style={{
                margin: "12px 0 0",
                maxWidth: 640,
                fontFamily: fontBody,
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--c-ink2)",
              }}
            >
              {lede}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            className="lg-m-shell-actions"
            style={{
              display: "flex",
              gap: 10,
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PageBody({ children, maxWidth }: { children: ReactNode; maxWidth: number }) {
  return (
    <div
      className="lg-m-shell-pagebody"
      style={{
        padding: "0 40px 64px",
        maxWidth,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}
