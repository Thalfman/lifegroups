import Link from "next/link";
import { redirect } from "next/navigation";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { getCurrentSession } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { AccountDeletionPanel } from "./account-deletion-panel";

export const dynamic = "force-dynamic";

const MAX_WIDTH = 720;

// Per-user account area (#562 / #563). Reachable by every signed-in role
// (admins, Over-Shepherds, Leaders) — not the leader-surface-gated /leader
// pages — so account management never depends on a feature flag. Hosts the
// links to the public support / deletion pages and the self-service
// account-deletion request control.
export default async function AccountPage() {
  const session = await getCurrentSession();
  if (session.kind !== "authenticated") redirect("/login");
  if (session.profile.status !== "active") redirect("/unauthorized");

  const { profile } = session;
  const user = {
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
  };
  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;

  return (
    <LgAppShell user={user}>
      <PageHeader
        eyebrow="Account"
        title="Your account"
        lede="Your sign-in details, where to get help, and account options."
        maxWidth={MAX_WIDTH}
      />
      <PageBody maxWidth={MAX_WIDTH}>
        <div className="grid gap-5">
          <section
            aria-labelledby="identity-heading"
            className="rounded-lg border border-line bg-surface p-card md:p-7"
          >
            <h2
              id="identity-heading"
              className="m-0 mb-3 font-display text-lg font-medium text-ink"
            >
              Signed in as
            </h2>
            <dl className="grid gap-2.5">
              <div className="flex flex-wrap gap-x-3">
                <dt className="min-w-[64px] font-sans text-sm text-ink3">
                  Name
                </dt>
                <dd className="m-0 font-sans text-base text-ink">
                  {profile.full_name}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="min-w-[64px] font-sans text-sm text-ink3">
                  Email
                </dt>
                <dd className="m-0 font-sans text-base text-ink">
                  {profile.email}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-3">
                <dt className="min-w-[64px] font-sans text-sm text-ink3">
                  Role
                </dt>
                <dd className="m-0 font-sans text-base text-ink">
                  {roleLabel}
                </dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby="help-heading"
            className="rounded-lg border border-line bg-surface p-card md:p-7"
          >
            <h2
              id="help-heading"
              className="m-0 mb-3 font-display text-lg font-medium text-ink"
            >
              Help &amp; policies
            </h2>
            <ul className="m-0 grid list-none gap-2.5 p-0">
              <li>
                <Link
                  href="/support"
                  className="font-sans text-base font-medium text-sageDeep no-underline"
                >
                  Support &amp; contact
                </Link>
              </li>
              <li>
                <Link
                  href="/account-deletion"
                  className="font-sans text-base font-medium text-sageDeep no-underline"
                >
                  How account deletion works
                </Link>
              </li>
            </ul>
          </section>

          <AccountDeletionPanel />
        </div>
      </PageBody>
    </LgAppShell>
  );
}
