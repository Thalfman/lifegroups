"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { validateDeletionRequest } from "@/lib/account/validation";
import { rpcRequestOwnAccountDeletion } from "@/lib/account/rpc";
import { makeSelfServiceAuthenticate } from "@/lib/account/run-action-auth";
import type { SelfServiceActor } from "@/lib/account/run-action-auth";
import { runWriteAction } from "@/lib/shared/run-action";
import { makeRpcErrorMapper } from "@/lib/shared/action-result";
import {
  PW_SETUP_COOKIE,
  passwordSetupCookieClearOptions,
} from "@/lib/auth/password-setup";
import {
  LANDING_HINT_COOKIE,
  landingHintCookieClearOptions,
} from "@/lib/auth/landing-hint";

export type DeletionRequestState = { error?: string };

// Generic copy: never echo Supabase error text to the browser. The real cause
// is in the structured log.
const GENERIC_FAILED = "Couldn't submit your request. Please try again.";

// Self-service account-deletion request (#563). A signed-in user requests
// deletion of their own account: the RPC archives their profile (revoking
// access) and records a pending request for the Super-Admin danger zone. We
// then end the live session and route to the public confirmation page.
export async function requestAccountDeletionAction(
  _prev: DeletionRequestState,
  formData: FormData
): Promise<DeletionRequestState> {
  // Both set inside `authenticate`; used after the runner returns so the
  // redirect throw and the sign-out teardown stay outside the pipeline.
  let noSession = false;
  const captured: { client: AppSupabaseClient | null } = { client: null };

  const result = await runWriteAction<
    SelfServiceActor,
    { reason: string | null },
    null
  >(
    {
      name: "account.request_deletion",
      authenticate: makeSelfServiceAuthenticate({
        notConfiguredError:
          "Account deletion isn't configured on this deployment.",
        onNoSession: () => {
          noSession = true;
        },
        captureClient: (c) => {
          captured.client = c;
        },
      }),
      read: (input) =>
        input instanceof FormData
          ? { confirm: input.get("confirm"), reason: input.get("reason") }
          : {},
      validate: validateDeletionRequest,
      rpc: (c, value) =>
        rpcRequestOwnAccountDeletion(c, { p_reason: value.reason }),
      // An existing pending request means the job is already done — treat it
      // like success: end the session and show the confirmation.
      treatAsOk: [
        {
          token: "deletion_already_requested",
          result: null,
          fields: { error_code: "already_requested" },
        },
      ],
      // The RPC archives the requester's own profile and the wrapper ends the
      // session; nothing they can still see needs revalidating.
      revalidate: () => [],
      result: () => null,
      noDataError: GENERIC_FAILED,
      mapRpcError: makeRpcErrorMapper(
        {
          forbidden_target:
            "Super Admins manage account removal in the Super-Admin danger zone.",
        },
        GENERIC_FAILED
      ),
    },
    formData
  );

  if (noSession) redirect("/login");
  if (!result.ok) return { error: result.errors[0] ?? GENERIC_FAILED };

  // Revoke the live session immediately too: the profile is now archived, but
  // signing out ends the cookie session so the app is inaccessible at once.
  // `local` scope mirrors logoutAction — other devices' sessions stay until the
  // archived profile fails their next role guard.
  await captured.client?.auth.signOut({ scope: "local" });
  const cookieStore = await cookies();
  cookieStore.set(PW_SETUP_COOKIE, "", passwordSetupCookieClearOptions());
  cookieStore.set(LANDING_HINT_COOKIE, "", landingHintCookieClearOptions());

  redirect("/account-deletion?status=requested");
}
