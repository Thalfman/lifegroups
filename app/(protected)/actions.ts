"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function logoutAction(): Promise<void> {
  const client = await createSupabaseServerClient();
  if (client) {
    // `local` scope so signing out on one device doesn't revoke the user's
    // sessions on every other device they're logged in on.
    await client.auth.signOut({ scope: "local" });
  }
  redirect("/login");
}
