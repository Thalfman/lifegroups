import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { MobileNav } from "@/components/layout/mobile-nav";

type AppShellProps = {
  children: ReactNode;
  title: string;
  subtitle: string;
};

export function AppShell({ children, title, subtitle }: AppShellProps) {
  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto grid max-w-7xl md:grid-cols-[260px_1fr]">
        <Sidebar />
        <div className="flex min-h-screen flex-col">
          <TopBar title={title} subtitle={subtitle} />
          <main className="flex-1 space-y-6 p-4 md:p-6">{children}</main>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
