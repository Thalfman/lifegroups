import Link from "next/link";
import { paperGrain } from "@/lib/pastoral";
import { PSeal } from "@/components/pastoral/atoms";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <div className="lg-m-noscrollx relative flex min-h-screen flex-col bg-bg font-sans text-ink">
      <div aria-hidden="true" style={paperGrain} />

      <header className="relative z-base border-b border-line bg-surface px-4 py-3 md:px-9 md:py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-inherit no-underline"
        >
          <PSeal />
          <div className="font-display text-md font-medium text-ink md:text-lg">
            Fox Valley Church Life Groups
          </div>
        </Link>
      </header>

      <main className="relative z-base grid flex-1 place-items-center px-6 py-10 md:py-20">
        <div className="w-full max-w-[420px]">
          {/* The page kicker — the one tracked-uppercase voice per page. */}
          <div className="mb-3.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
            Reset password
          </div>
          <h1 className="m-0 mb-3.5 font-display text-3xl font-normal text-ink md:text-4xl">
            Forgot your password?
          </h1>
          <p className="mb-6 mt-0 font-sans text-base text-ink2">
            Enter your email and we&apos;ll send a reset link.
          </p>

          <ForgotPasswordForm />

          <p className="mb-0 mt-5 text-center font-sans text-sm text-ink3">
            <Link href="/login" className="font-medium text-clay underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
