"use client";

import { PButton } from "@/components/pastoral/button";
import { logoutAction } from "@/app/(protected)/actions";

// Default `className` is `lg-m-signout-hide` so the sign-out button in the
// top header automatically hides on mobile (≤767px). The mobile nav drawer
// renders <LogoutButton className="" /> explicitly to surface it there.
export function LogoutButton({
  className = "lg-m-signout-hide",
}: {
  className?: string;
} = {}) {
  return (
    <form action={logoutAction} className={className}>
      <PButton type="submit" tone="ghost" size="sm">
        Sign out
      </PButton>
    </form>
  );
}
