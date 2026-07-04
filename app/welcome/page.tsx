import { redirect } from "next/navigation";
import { PublicPageShell } from "@/components/lg/PublicPageShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readOwnNameState } from "@/lib/account/own-name";
import { WelcomeForm } from "./welcome-form";

export const dynamic = "force-dynamic";

// Choose-your-name fallback gate (ADR 0032). An invited person normally picks
// their name on /reset-password alongside their password, but two paths skip
// that screen: an invite to an email that already had a login (no setup email
// is sent), and an abandoned setup. The (protected) layout and the Home Hub
// redirect pending-name sessions here; this page lives OUTSIDE (protected) so
// the redirect can't loop.
export default async function WelcomePage() {
  const client = await createSupabaseServerClient();
  // No Supabase env (public preview) means no sessions — nothing to gate.
  if (!client) redirect("/login");

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");

  const nameState = await readOwnNameState(client, user.id);
  // Name already chosen — nothing to do here.
  if (nameState && !nameState.pending) redirect("/");
  // On a failed read (nameState null), still render the form rather than
  // redirect: bouncing back to "/" would ping-pong with the layout gate, and
  // the RPC re-checks pendingness itself, so submitting is always safe.

  return (
    <PublicPageShell>
      <main className="relative z-base grid flex-1 place-items-center px-6 py-10 md:py-20">
        <div className="w-full max-w-[420px]">
          {/* The page kicker — the one tracked-uppercase voice per page. */}
          <div className="mb-3.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
            Welcome
          </div>
          <h1 className="m-0 mb-3.5 font-display text-3xl font-normal text-ink md:text-4xl">
            What should we call you?
          </h1>
          <p className="mb-6 mt-0 font-sans text-base text-ink2">
            Choose the name you want to go by. It&apos;s how you&apos;ll appear
            to your ministry team across Life Groups.
          </p>

          <WelcomeForm namePrefill={nameState?.prefill ?? ""} />
        </div>
      </main>
    </PublicPageShell>
  );
}
