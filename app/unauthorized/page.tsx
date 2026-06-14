import { PublicPageShell } from "@/components/lg/PublicPageShell";
import { PButton, PLinkButton } from "@/components/pastoral/button";
import { logoutAction } from "@/app/(protected)/actions";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Reason = "unavailable" | undefined;

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: string }>;
}) {
  const session = await getCurrentSession();
  const sp = (await searchParams) ?? {};
  const reason: Reason =
    sp.reason === "unavailable" ? "unavailable" : undefined;
  // Backend transient failures surface here via /unauthorized?reason=unavailable
  // and also when the session itself is in backend_error state. Show a
  // service-unavailable message in that case so users don't try to
  // self-remediate a misdiagnosed "account not linked" path.
  const isUnavailable =
    reason === "unavailable" || session.kind === "backend_error";
  const isSignedIn = !isUnavailable && session.kind !== "anonymous";
  const hasLinkedProfile = !isUnavailable && session.kind === "authenticated";

  return (
    <PublicPageShell>
      <main className="relative z-base grid flex-1 place-items-center px-6 py-10">
        {/* Card anatomy: border, no shadow (the ghost border+shadow combo retires). */}
        <div className="w-full max-w-[520px] rounded-lg border border-line bg-surface p-7 md:p-11">
          {/* The page kicker — the one tracked-uppercase voice per page. */}
          <div className="mb-2 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
            {isUnavailable ? "Service unavailable" : "No access"}
          </div>
          <h1 className="m-0 font-display text-3xl font-normal text-ink md:text-4xl">
            {isUnavailable
              ? "We can’t reach the service right now."
              : "You don’t have access."}
          </h1>
          <p className="mb-0 mt-3.5 font-sans text-md text-ink2">
            {isUnavailable
              ? "This is usually temporary. Please try again in a minute. If it keeps happening, contact a ministry admin."
              : isSignedIn && !hasLinkedProfile
                ? "Your sign-in worked, but your account isn't linked to a ministry profile yet. Ask a ministry admin to invite you."
                : "Your account doesn't have access here. If you think this is wrong, contact a ministry admin."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <PLinkButton href="/" tone="ghost">
              Back to home
            </PLinkButton>
            {isSignedIn ? (
              <form action={logoutAction}>
                <PButton type="submit" tone="solid">
                  Sign out
                </PButton>
              </form>
            ) : (
              <PLinkButton href="/login" tone="terra">
                Sign in
              </PLinkButton>
            )}
          </div>
        </div>
      </main>
    </PublicPageShell>
  );
}
