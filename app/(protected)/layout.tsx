import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { namePendingRedirectTarget } from "@/lib/auth/name-pending";
import { UsageBeacon } from "@/components/usage/usage-beacon";
import { OfflineBanner } from "@/components/lg/OfflineBanner";
import { InstallNudge } from "@/components/pwa/install-nudge";
import { LandingHintRefresher } from "@/components/auth/landing-hint-refresher";

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
    case "authenticated": {
      // Choose-your-name gate (ADR 0032): an invited person who hasn't picked
      // their name yet (e.g. their email already had a login, so they never
      // saw /reset-password) finishes that one step before using the app.
      const nameGate = namePendingRedirectTarget(session);
      if (nameGate) redirect(nameGate);
      // UsageBeacon records coarse area views for any authenticated user, but
      // only while the Super-Admin usage_tracking flag is on (the RPC self-
      // gates). Mounted here so it covers every protected surface — admin,
      // leader, and over-shepherd.
      return (
        <>
          <OfflineBanner />
          <InstallNudge />
          <UsageBeacon />
          {/* Re-pin the role's landing-path hint so a later bare-domain launch
              redirects straight to this surface from middleware, skipping the
              dynamic `/` render. Non-authoritative — guards still gate access. */}
          <LandingHintRefresher role={session.profile.role} />
          {children}
        </>
      );
    }
  }
}
