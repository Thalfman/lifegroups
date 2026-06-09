import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { UsageBeacon } from "@/components/usage/usage-beacon";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getCurrentSession();
  switch (session.kind) {
    case "anonymous":
      redirect("/login");
    case "profile_missing":
      redirect("/unauthorized");
    case "backend_error":
      redirect("/unauthorized?reason=unavailable");
    case "authenticated":
      // UsageBeacon records coarse area views for any authenticated user, but
      // only while the Super-Admin usage_tracking flag is on (the RPC self-
      // gates). Mounted here so it covers every protected surface — admin,
      // leader, and over-shepherd.
      return (
        <>
          <UsageBeacon />
          {children}
        </>
      );
  }
}
