import Link from "next/link";
import type { Metadata } from "next";
import { PublicPageShell } from "@/components/lg/PublicPageShell";

export const metadata: Metadata = {
  title: "Privacy policy — Fox Valley Church Life Groups",
  description:
    "How Fox Valley Church Life Groups collects, uses, and protects data — the information we hold, who processes it, and the choices you have.",
};

// Public, unauthenticated privacy policy (mobile store roadmap Phase 3, #568).
// Both app stores require a reachable privacy policy, and the data-safety forms
// must align with it. Linked from the login surface and from the authenticated
// account area. The content is derived from the data-inventory doc
// (docs/store/data-inventory.md, #561) and is deliberately conservative — it
// does not overclaim compliance. No Supabase access — this renders for anyone.
//
// Final wording awaits the owner's sign-off before store submission (#568
// acceptance criteria); the structure and the data/processor facts are accurate
// to the current model so the review is over wording, not substance.
export default function PrivacyPolicyPage() {
  return (
    <PublicPageShell>
      <main className="relative z-base mx-auto w-full max-w-[680px] flex-1 px-6 py-10 md:py-16">
        {/* The page kicker — the one tracked-uppercase voice per page. */}
        <div className="mb-3.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
          Policies
        </div>
        <h1 className="m-0 mb-3.5 font-display text-3xl font-normal text-ink md:text-4xl">
          Privacy policy
        </h1>
        <p className="mb-8 mt-0 max-w-[58ch] font-sans text-base text-ink2">
          Life Groups is an invite-only ministry tool that Fox Valley Church
          staff, Over-Shepherds, and Life Group Shepherds use to care for their
          groups. This policy explains what information the app holds, who
          processes it on our behalf, and the choices you have. There is no
          public sign-up: group members do not log in, and the app does not
          browse or share data publicly.
        </p>

        <section aria-labelledby="who-heading" className="mb-7">
          <h2
            id="who-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            Who uses the app
          </h2>
          <p className="m-0 font-sans text-base text-ink2">
            Only invited people <strong>sign in</strong> — ministry staff,
            Over-Shepherds, and Life Group Shepherds. Group{" "}
            <strong>members</strong> do not have logins; they are records that
            ministry staff maintain on their behalf so the team can care for
            them. The app does not offer a public account or member-facing
            browsing.
          </p>
        </section>

        <section aria-labelledby="collect-heading" className="mb-7">
          <h2
            id="collect-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            What information we hold
          </h2>
          <p className="m-0 mb-3 font-sans text-base text-ink2">
            We hold only what the ministry needs to care for its groups:
          </p>
          <ul className="m-0 grid list-disc gap-2 pl-5 font-sans text-base text-ink2">
            <li>
              <strong>Account &amp; sign-in.</strong> For people who log in:
              name, email, optional phone, role, and status, plus the
              authentication credentials (a hashed password and session cookies)
              that keep you signed in.
            </li>
            <li>
              <strong>Member records.</strong> For group members (who do not log
              in): name, optional email and phone, household name, and a
              care-sensitivity flag.
            </li>
            <li>
              <strong>Group information.</strong> Group name, meeting day, time
              and location, capacity, lifecycle and health status, audience and
              category, and group notes — plus per-meeting attendance.
            </li>
            <li>
              <strong>Care information.</strong> Pastoral{" "}
              <strong>Care Notes</strong> and <strong>Prayer Requests</strong>,
              shepherd-care status and follow-ups, and group- and
              shepherd-health updates and grades.
            </li>
            <li>
              <strong>Interest Funnel.</strong> For people interested in joining
              a group: name, optional email and phone, the funnel state, the
              group they would like to join, and notes.
            </li>
            <li>
              <strong>Operational records.</strong> An audit trail of who did
              what (actions and metadata, not free-text bodies), which
              Over-Shepherd covers which Shepherd, and — only when the ministry
              turns it on — coarse usage signals (such as a sign-in or which
              area was viewed).
            </li>
          </ul>
          <p className="mt-3 font-sans text-base text-ink2">
            We do <strong>not</strong> ask for health, biometric, financial,
            precise-location, or advertising data. The only sensitive content is
            what a shepherd chooses to write into a free-text Care Note or
            Prayer Request, by intent.
          </p>
        </section>

        <section aria-labelledby="use-heading" className="mb-7">
          <h2
            id="use-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            How we use it
          </h2>
          <p className="m-0 font-sans text-base text-ink2">
            We use this information solely to run the ministry&apos;s care work
            — signing you in, organizing groups, tracking who needs care and
            what the next step is, and helping shepherds decide when to launch
            another group. We do not use it for advertising, and we do not track
            you across other apps or sites.
          </p>
        </section>

        <section aria-labelledby="visibility-heading" className="mb-7">
          <h2
            id="visibility-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            Who can see sensitive notes
          </h2>
          <p className="m-0 font-sans text-base text-ink2">
            Care Notes, Prayer Requests, and shepherd-care notes are fenced by
            database-level access rules and a visibility ladder (Super Admin ▸
            Ministry Admin ▸ Over-Shepherd ▸ Shepherd). Two protections go
            further: a Care Note stays sealed to the person who wrote it until
            the Ministry Admin grants a per-person transparency setting, and the
            Ministry Admin&apos;s own Private Care Note is hidden even from the
            Super Admin.
          </p>
        </section>

        <section aria-labelledby="processors-heading" className="mb-7">
          <h2
            id="processors-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            Who processes data for us
          </h2>
          <p className="m-0 mb-3 font-sans text-base text-ink2">
            We rely on a small number of service providers, each receiving only
            what it needs:
          </p>
          <ul className="m-0 grid list-disc gap-2 pl-5 font-sans text-base text-ink2">
            <li>
              <strong>Supabase</strong> — our database, authentication, and
              transactional email (invites and password resets).
            </li>
            <li>
              <strong>Vercel</strong> — application hosting, with aggregate,
              anonymous analytics and performance metrics (no advertising and no
              cross-site tracking).
            </li>
            <li>
              <strong>Upstash</strong> — abuse and enumeration rate limiting on
              the password-reset endpoint, using a hashed key.
            </li>
          </ul>
        </section>

        <section aria-labelledby="retention-heading" className="mb-7">
          <h2
            id="retention-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            Keeping and deleting data
          </h2>
          <p className="m-0 font-sans text-base text-ink2">
            The default way anything leaves a surface is a reversible archive (a
            soft delete), not a permanent erase. You can request deletion of
            your sign-in account at any time — see the{" "}
            <Link
              href="/account-deletion"
              className="font-medium text-sageDeep no-underline"
            >
              account deletion
            </Link>{" "}
            page for how it works and what is removed versus retained. Care
            Notes and Prayer Requests you wrote are kept as part of the
            ministry&apos;s ongoing care history.
          </p>
        </section>

        <section aria-labelledby="contact-heading" className="mb-7">
          <h2
            id="contact-heading"
            className="m-0 mb-2 font-display text-lg font-medium text-ink"
          >
            Questions
          </h2>
          <p className="m-0 font-sans text-base text-ink2">
            For any privacy question, or to ask about the data we hold about
            you, reach the ministry team from the{" "}
            <Link
              href="/support"
              className="font-medium text-sageDeep no-underline"
            >
              support page
            </Link>
            .
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
