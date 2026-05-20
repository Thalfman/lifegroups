import type { ReactNode } from "react";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin();
  return (
    <LgAppShell
      user={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
    >
      {children}
    </LgAppShell>
  );
}
