import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "anonymous":
      redirect("/login");
    case "profile_missing":
      redirect("/unauthorized");
    case "backend_error":
      redirect("/unauthorized?reason=unavailable");
    case "authenticated":
      return <>{children}</>;
  }
}
