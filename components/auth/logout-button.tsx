"use client";

import { PButton } from "@/components/pastoral/button";
import { logoutAction } from "@/app/(protected)/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <PButton type="submit" tone="ghost" size="sm">
        Sign out
      </PButton>
    </form>
  );
}
