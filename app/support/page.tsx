import Link from "next/link";
import type { Metadata } from "next";
import { PublicPageShell } from "@/components/lg/PublicPageShell";
import { getSupportContact, supportMailtoHref } from "@/lib/support/contact";

export const metadata: Metadata = {
  title: "Support: Fox Valley Church Life Groups",
  description:
    "Get help with your Fox Valley Church Life Groups account: how to reach support, sign-in help, and account options.",
};

// Public, unauthenticated support / contact page (mobile store roadmap Phase 3,
// #562). Both app stores require a reachable support contact. Linked from the
// login surface and from the authenticated account area. The contact is sourced
// from config (NEXT_PUBLIC_SUPPORT_EMAIL) with a placeholder fallback, never a
// hardcoded personal address. No Supabase access — this renders for anyone.
export default function SupportPage() {
  const contact = getSupportContact();

  return (
    <PublicPageShell>
      <main className="relative z-base mx-auto w-full max-w-[640px] flex-1 px-6 py-10 md:py-16">
        {/* The page kicker — the one tracked-uppercase voice per page. */}
        <div className="mb-3.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
          Help
        </div>
        <h1 className="m-0 mb-3.5 font-display text-3xl font-normal text-ink md:text-4xl">
          Support
        </h1>
        <p className="mb-8 mt-0 max-w-[52ch] font-sans text-base text-ink2">
          Life Groups is the invite-only ministry tool Fox Valley Church staff,
          Over-Shepherds, and Life Group Leaders use to care for groups. If you
          need help, here&apos;s how to reach us.
        </p>

        <section
          aria-labelledby="contact-heading"
          className="rounded-lg border border-line bg-surface p-card md:p-7"
        >
          <h2
            id="contact-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            Contact support
          </h2>
          <p className="m-0 mb-4 font-sans text-base text-ink2">
            Email the ministry team and we&apos;ll get back to you. Please
            include your name, your role, and a short description of what you
            need.
          </p>
          <a
            href={supportMailtoHref(contact, "Life Groups support request")}
            className="inline-flex items-center gap-2 rounded-sm border border-line bg-bg px-4 py-2.5 font-sans text-base font-medium text-sageDeep no-underline hover:border-sage"
          >
            {contact.email}
          </a>
        </section>

        <section aria-labelledby="faq-heading" className="mt-8">
          <h2
            id="faq-heading"
            className="m-0 mb-4 font-display text-lg font-medium text-ink"
          >
            Common questions
          </h2>
          <dl className="grid gap-5">
            <div>
              <dt className="m-0 font-sans text-base font-semibold text-ink">
                I can&apos;t sign in.
              </dt>
              <dd className="m-0 mt-1 font-sans text-base text-ink2">
                Use{" "}
                <Link
                  href="/forgot-password"
                  className="font-medium text-sageDeep no-underline"
                >
                  Forgot password
                </Link>{" "}
                to reset it. Access is invite-only. If you were never invited,
                ask your ministry team to add you.
              </dd>
            </div>
            <div>
              <dt className="m-0 font-sans text-base font-semibold text-ink">
                Do group members sign in?
              </dt>
              <dd className="m-0 mt-1 font-sans text-base text-ink2">
                No. Members don&apos;t have logins. Only ministry staff,
                Over-Shepherds, and Life Group Leaders use the app.
              </dd>
            </div>
            <div>
              <dt className="m-0 font-sans text-base font-semibold text-ink">
                How do I delete my account?
              </dt>
              <dd className="m-0 mt-1 font-sans text-base text-ink2">
                See the{" "}
                <Link
                  href="/account-deletion"
                  className="font-medium text-sageDeep no-underline"
                >
                  account deletion
                </Link>{" "}
                page for how to request it.
              </dd>
            </div>
          </dl>
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
