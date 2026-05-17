"use client";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/(protected)/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" variant="outline">
        Sign out
      </Button>
    </form>
  );
}
