"use client";

import { useEffect } from "react";
import type { UserRole } from "@/lib/auth/roles";
import {
  landingHintCookieString,
  landingHintForRole,
} from "@/lib/auth/landing-hint";

// Refreshes the non-authoritative landing-path hint cookie for an already
// authenticated user (the login action sets it on sign-in; this keeps it fresh
// for sessions that never re-login). Mounted from the protected layout with the
// authoritatively-resolved session role, so every protected page load re-pins
// the hint — self-healing if a user's role changed since their last sign-in.
//
// Renders nothing. The hint is a UX shortcut only (see lib/auth/landing-hint.ts
// header); it is never used for authorization, so writing it from the client is
// safe.
export function LandingHintRefresher({ role }: { role: UserRole }) {
  useEffect(() => {
    const hint = landingHintForRole(role);
    if (!hint) return;
    document.cookie = landingHintCookieString(hint, {
      secure: window.location.protocol === "https:",
    });
  }, [role]);

  return null;
}
