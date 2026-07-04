"use client";

import { logoutAction } from "@/app/(protected)/actions";
import { Button } from "@/components/ui/button";

// Default `className` hides the sign-out button in the top header on mobile
// (≤767px). The mobile nav drawer renders <LogoutButton className="" />
// explicitly to surface it there.
export function LogoutButton({
  className = "hidden md:block",
}: {
  className?: string;
} = {}) {
  return (
    <form action={logoutAction} className={className}>
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}
