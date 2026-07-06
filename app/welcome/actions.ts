"use server";

import { redirect } from "next/navigation";
import { validateOwnFullName } from "@/lib/account/validation";
import { rpcSetOwnFullName } from "@/lib/account/rpc";
import { makeSelfServiceAuthenticate } from "@/lib/account/run-action-auth";
import { runWriteAction } from "@/lib/shared/run-action";
import type { SelfServiceActor } from "@/lib/account/run-action-auth";

export type ChooseNameState = { error?: string };

// Generic copy: never echo Supabase error text to the browser. Real cause is
// in the structured log.
const GENERIC_NAME_FAILED = "Couldn't save your name. Try again.";

export async function chooseNameAction(
  _prev: ChooseNameState,
  formData: FormData
): Promise<ChooseNameState> {
  // Set inside `authenticate`; checked after the runner returns so the
  // redirect throw happens outside the pipeline.
  let noSession = false;

  const result = await runWriteAction<
    SelfServiceActor,
    { fullName: string },
    null
  >(
    {
      name: "account.choose_name",
      authenticate: makeSelfServiceAuthenticate({
        notConfiguredError:
          "Account setup is not configured on this deployment.",
        onNoSession: () => {
          noSession = true;
        },
      }),
      read: (input) =>
        input instanceof FormData ? { full_name: input.get("full_name") } : {},
      validate: (raw) => {
        const v = validateOwnFullName(String(raw.full_name ?? ""));
        return v.ok
          ? { ok: true, value: { fullName: v.value } }
          : { ok: false, errors: [v.error] };
      },
      rpc: (client, value) =>
        rpcSetOwnFullName(client, { p_full_name: value.fullName }),
      // name_not_pending = a double submit (or a parallel tab) already saved a
      // name; the gate's job is done either way.
      treatAsOk: [
        {
          token: "name_not_pending",
          result: null,
          fields: { error_code: "name_not_pending" },
        },
      ],
      // The chosen name renders in every shell header; refresh the whole tree.
      revalidate: () => ({ path: "/", type: "layout" }),
      result: () => null,
      noDataError: GENERIC_NAME_FAILED,
      mapRpcError: () => GENERIC_NAME_FAILED,
    },
    formData
  );

  if (noSession) redirect("/login");
  if (!result.ok) return { error: result.errors[0] ?? GENERIC_NAME_FAILED };
  redirect("/");
}
