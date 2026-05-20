import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import { adminNavGroups, type UserRole } from "@/lib/auth/roles";
import { Sidebar } from "./Sidebar";
import { MobileSidebarTrigger } from "./MobileSidebar";
import { TopBar } from "./TopBar";

export function LgAppShell({
  user,
  children,
}: {
  user: { name: string; email: string | null; role: UserRole };
  children: ReactNode;
}) {
  const navGroups = adminNavGroups(user.role);
  return (
    <div
      className="lg-m-noscrollx"
      style={{
        background: "var(--c-bg)",
        color: "var(--c-ink)",
        minHeight: "100vh",
        fontFamily: "var(--font-body)",
        display: "grid",
        gridTemplateColumns: "232px minmax(0, 1fr)",
      }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Sidebar navGroups={navGroups} />
      <div
        className="lg-shell-main"
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TopBar
          user={user}
          mobileTrigger={<MobileSidebarTrigger navGroups={navGroups} />}
          signOutSlot={<LogoutButton className="" />}
        />
        <main id="main" style={{ flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
