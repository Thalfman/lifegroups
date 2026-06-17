import Link from "next/link";
import { PublicPageShell } from "@/components/lg/PublicPageShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { callJsonRpc } from "@/lib/shared/rpc";
import { hashInviteToken } from "@/lib/shared/invite-token";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { InviteSignupForm } from "./invite-signup-form";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

type PeekStatus = "valid" | "expired" | "revoked" | "used" | "not_found";

type PeekResult = {
  status: PeekStatus;
  role?: keyof typeof ROLE_LABELS;
};

const STATUS_MESSAGES: Record<Exclude<PeekStatus, "valid">, string> = {
  expired: "This invite link has expired.",
  revoked: "This invite link has been turned off.",
  used: "This invite link has already been used.",
  not_found: "This invite link is invalid.",
};

async function peek(token: string): Promise<PeekResult | { error: string }> {
  const client = await createSupabaseServerClient();
  if (!client) return { error: "Sign-ups aren’t available right now." };
  const tokenHash = hashInviteToken(token);
  const { data, error } = await callJsonRpc(client, "peek_invitation", {
    p_token_hash: tokenHash,
  });
  if (error)
    return { error: "We couldn't check this link. Try again shortly." };
  const row = (data ?? {}) as { status?: string; role?: string };
  const status = (row.status ?? "not_found") as PeekStatus;
  return { status, role: row.role as PeekResult["role"] };
}

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const result = await peek(token);

  const ok = "status" in result && result.status === "valid";
  const notice =
    "error" in result
      ? result.error
      : result.status !== "valid"
        ? `${STATUS_MESSAGES[result.status]} Ask whoever invited you for a fresh link.`
        : null;
  const roleLabel =
    "status" in result && result.role ? ROLE_LABELS[result.role] : null;

  return (
    <PublicPageShell>
      <main className="relative z-base grid flex-1 place-items-center px-6 py-10 md:py-20">
        <div className="w-full max-w-[420px]">
          {/* The page kicker — the one tracked-uppercase voice per page. */}
          <div className="mb-3.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
            You&apos;re invited
          </div>
          <h1 className="m-0 mb-3.5 font-display text-3xl font-normal text-ink md:text-4xl">
            {ok ? "Set up your login" : "Invite link"}
          </h1>
          <p className="mb-6 mt-0 font-sans text-base text-ink2">
            {ok
              ? `Create your account${
                  roleLabel ? ` as ${roleLabel}` : ""
                }. Enter your name and email and choose a password — at least 8 characters.`
              : "Let's get you set up."}
          </p>

          {notice ? (
            /* Error status note: soft rose bg + rose fg, no stripe. */
            <p
              role="alert"
              className="m-0 mb-5 rounded-sm bg-roseSoft px-3.5 py-3 font-sans text-sm text-rose"
            >
              {notice}{" "}
              <Link href="/login" className="font-semibold underline">
                Go to sign in
              </Link>
              .
            </p>
          ) : (
            <InviteSignupForm token={token} />
          )}
        </div>
      </main>
    </PublicPageShell>
  );
}
