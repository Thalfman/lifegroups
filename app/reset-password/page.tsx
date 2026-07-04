import Link from "next/link";
import { PublicPageShell } from "@/components/lg/PublicPageShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readOwnNameState } from "@/lib/account/own-name";
import { ResetPasswordForm } from "./reset-password-form";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  code?: string | string[];
  token_hash?: string | string[];
  type?: string | string[];
  status?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// What the page should render. The single-use recovery token is NOT consumed
// here — that happens in /auth/confirm only when the user clicks the button
// below, so an email-provider link scanner's GET of this page burns nothing.
type View =
  | { kind: "not_configured" }
  // recovery session already established (post /auth/confirm). namePending is
  // the choose-your-name step (ADR 0032): an invited person picks their name
  // here alongside their password; namePrefill carries an existing name (the
  // relink case) for them to confirm or edit.
  | { kind: "form"; namePending: boolean; namePrefill: string }
  | { kind: "confirm"; fields: Record<string, string> } // valid-looking link → show the button
  | { kind: "invalid" }; // missing/used/expired link → resend CTA

async function resolveView(params: {
  code?: string;
  tokenHash?: string;
  type?: string;
  status?: string;
}): Promise<View> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "not_configured" };

  // A recovery session set by /auth/confirm means we can show the form. We
  // check this first so a refresh after confirming doesn't fall back to the
  // (now-consumed) link state.
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) {
    // A failed read degrades to a password-only form — never block password
    // setup on it; the /welcome gate catches a missed pending name later.
    const nameState = await readOwnNameState(client, user.id);
    return {
      kind: "form",
      namePending: nameState?.pending ?? false,
      namePrefill: nameState?.prefill ?? "",
    };
  }

  if (params.status === "invalid") return { kind: "invalid" };

  // Carry the link params into a form that POSTs to /auth/confirm, which spends
  // the token via verifyOtp / exchangeCodeForSession on the user's explicit
  // click. A POST (not a link) means Next can't prefetch it and a scanner's GET
  // can't reach it — so nothing is consumed before the user acts.
  const next = "/reset-password";
  if (params.tokenHash && params.type) {
    return {
      kind: "confirm",
      fields: { token_hash: params.tokenHash, type: params.type, next },
    };
  }
  if (params.code) {
    return { kind: "confirm", fields: { code: params.code, next } };
  }

  return { kind: "invalid" };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const view = await resolveView({
    code: first(params.code),
    tokenHash: first(params.token_hash),
    type: first(params.type),
    status: first(params.status),
  });

  return (
    <PublicPageShell>
      <main className="relative z-base grid flex-1 place-items-center px-6 py-10 md:py-20">
        <div className="w-full max-w-[420px]">
          {/* The page kicker — the one tracked-uppercase voice per page. */}
          <div className="mb-3.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
            Reset password
          </div>
          <h1 className="m-0 mb-3.5 font-display text-3xl font-normal text-ink md:text-4xl">
            {view.kind === "form"
              ? view.namePending
                ? "Set up your account"
                : "Set a new password"
              : view.kind === "confirm"
                ? "Confirm it's you"
                : view.kind === "not_configured"
                  ? "Reset password"
                  : "Link expired or already used"}
          </h1>
          <p className="mb-6 mt-0 font-sans text-base text-ink2">
            {view.kind === "form"
              ? view.namePending
                ? "Tell us your name and choose a password for your account. Password must be at least 8 characters."
                : "Choose a new password for your account. Must be at least 8 characters."
              : view.kind === "confirm"
                ? "For your security, confirm below to continue resetting your password. Reset links can only be used once."
                : view.kind === "not_configured"
                  ? "Password reset isn’t available right now."
                  : "Reset links can only be used once and expire after a short time. Request a fresh one and use it right away."}
          </p>

          {view.kind === "form" ? (
            <ResetPasswordForm
              namePending={view.namePending}
              namePrefill={view.namePrefill}
            />
          ) : view.kind === "confirm" ? (
            <form method="post" action="/auth/confirm">
              {Object.entries(view.fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <Button type="submit" variant="primary" className="w-full">
                Set my new password
              </Button>
            </form>
          ) : (
            /* Error status note: soft rose bg + rose fg, no stripe. */
            <p
              role="alert"
              className="m-0 mb-5 rounded-sm bg-roseSoft px-3.5 py-3 font-sans text-sm text-rose"
            >
              {view.kind === "not_configured"
                ? "Password reset isn’t available right now."
                : "This reset link is invalid, was already used, or has expired."}{" "}
              <Link href="/forgot-password" className="font-semibold underline">
                Request a new link
              </Link>
              .
            </p>
          )}
        </div>
      </main>
    </PublicPageShell>
  );
}
