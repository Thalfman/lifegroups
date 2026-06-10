"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { startActionLog } from "@/lib/observability/instrument";
import { validateOwnFullName } from "@/lib/account/validation";
import { rpcSetOwnFullName } from "@/lib/account/rpc";

export type ChooseNameState = { error?: string };

// Generic copy: never echo Supabase error text to the browser. Real cause is
// in the structured log.
const GENERIC_NAME_FAILED = "Couldn't save your name. Try again.";

export async function chooseNameAction(
  _prev: ChooseNameState,
  formData: FormData
): Promise<ChooseNameState> {
  const ctx = startActionLog("account.choose_name");

  const v = validateOwnFullName(String(formData.get("full_name") ?? ""));
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed" });
    return { error: v.error };
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured" });
    return { error: "Account setup is not configured on this deployment." };
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    ctx.finish("denied", { error_code: "no_session" });
    redirect("/login");
  }

  const rpc = await rpcSetOwnFullName(client, { p_full_name: v.value });
  // name_not_pending = a double submit (or a parallel tab) already saved a
  // name; the gate's job is done either way.
  if (rpc.error && !rpc.error.message.includes("name_not_pending")) {
    ctx.finish("fail", { error_code: "set_own_full_name_failed" });
    return { error: GENERIC_NAME_FAILED };
  }

  ctx.finish("ok");
  // The chosen name renders in every shell header; refresh the whole tree.
  revalidatePath("/", "layout");
  redirect("/");
}
