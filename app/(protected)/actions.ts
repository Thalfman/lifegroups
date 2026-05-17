"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function logoutAction(): Promise<void> {
  const client = await createSupabaseServerClient();
  if (client) {
    await client.auth.signOut();
  }
  redirect("/login");
}
