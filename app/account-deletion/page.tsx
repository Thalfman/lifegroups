import Link from "next/link";
import type { Metadata } from "next";
import { PublicPageShell } from "@/components/lg/PublicPageShell";

export const metadata: Metadata = {
  title: "Account deletion — Fox Valley Church Life Groups",
  description:
    "How to request deletion of your Fox Valley Church Life Groups account, and what is removed versus retained.",
};

// Public, unauthenticated account-deletion documentation (mobile store roadmap
// Phase 3, #563). Both stores require a reachable description of how account
// deletion works. Reviewers reach it without a login. The in-app request itself
// is for signed-in users; this page documents it and what happens. When the
// in-app flow redirects here with ?status=requested it doubles as the
// post-request confirmation.
export default async function AccountDeletionPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string | string[] }>;
}) {
  const statusRaw = (await searchParams)?.status;
  const requested =
    (Array.isArray(statusRaw) ? statusRaw[0] : statusRaw) === "requested";

  return (
    <PublicPageShell>
      <main className="relative z-base mx-auto w-full max-w-[640px] flex-1 px-6 py-10 md:py-16">
        {requested ? (
          <p
            role="status"
            className="mb-8 rounded-sm border border-sageSoft bg-sageSoft px-4 py-3 font-sans text-base text-sageDeep"
          >
            Your deletion request was received and you&apos;ve been signed out.
            An administrator will complete the permanent removal.
          </p>
        ) : null}

        {/* The page kicker — the one tracked-uppercase voice per page. */}
        <div className="mb-3.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
          Account
        </div>
        <h1 className="m-0 mb-3.5 font-display text-3xl font-normal text-ink md:text-4xl">
          Account deletion
        </h1>
        <p className="mb-8 mt-0 max-w-[54ch] font-sans text-base text-ink2">
          Life Groups is an invite-only ministry tool. This page explains who
          can request account deletion, what is removed, and how to ask.
        </p>

        <section aria-labelledby="who-heading" className="mb-7">
          <h2
            id="who-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            Who this applies to
          </h2>
          <p className="m-0 font-sans text-base text-ink2">
            People who <strong>sign in</strong> — ministry staff,
            Over-Shepherds, and Life Group Leaders. Group members do not have
            logins, so there is no member account to delete; ask your ministry
            team to update or remove a member record.
          </p>
        </section>

        <section aria-labelledby="what-heading" className="mb-7">
          <h2
            id="what-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            What is removed and what is kept
          </h2>
          <ul className="m-0 grid list-disc gap-2 pl-5 font-sans text-base text-ink2">
            <li>
              <strong>Removed:</strong> your sign-in account and personal
              profile data (name, email, phone). On request, your access is
              revoked immediately and your profile is archived; an administrator
              then permanently removes it.
            </li>
            <li>
              <strong>Kept:</strong> Care Notes and Prayer Requests you wrote
              stay as part of the ministry&apos;s ongoing care history —
              deletion targets your account, not the group&apos;s care record.
            </li>
          </ul>
        </section>

        <section aria-labelledby="how-heading" className="mb-7">
          <h2
            id="how-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            How to request deletion
          </h2>
          <ol className="m-0 grid list-decimal gap-2 pl-5 font-sans text-base text-ink2">
            <li>
              Sign in and open{" "}
              <Link
                href="/account"
                className="font-medium text-sageDeep no-underline"
              >
                your account
              </Link>
              .
            </li>
            <li>
              Under <em>Delete your account</em>, confirm and choose{" "}
              <em>Request account deletion</em>.
            </li>
            <li>You&apos;ll be signed out and your request recorded.</li>
          </ol>
          <p className="mt-3 font-sans text-base text-ink2">
            Can&apos;t sign in? Email us from the{" "}
            <Link
              href="/support"
              className="font-medium text-sageDeep no-underline"
            >
              support page
            </Link>{" "}
            and we&apos;ll process the request for you.
          </p>
        </section>

        <p className="mt-10 font-sans text-sm text-ink3">
          <Link
            href="/login"
            className="font-medium text-sageDeep no-underline"
          >
            ← Back to sign in
          </Link>
        </p>
      </main>
    </PublicPageShell>
  );
}
