import Link from "next/link";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { AddToHomeScreenButton } from "@/components/pwa/add-to-home-screen-button";
import { cardClassName } from "@/components/lg/Card";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { requireLeader } from "@/lib/auth/session";
import { toShellUser } from "@/lib/auth/shell-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type LeaderSafeGroupRow } from "@/lib/supabase/group-reads";
import { bindLeaderReads } from "@/lib/leader/leader-reads";
import { readFirstRunOrientationSeen } from "@/lib/account/orientation";
import { FirstRunCard } from "@/components/orientation/first-run-card";

export const dynamic = "force-dynamic";

const MAX_WIDTH = 720;

// Leader landing — the care dashboard (#382, ADR 0017 / ADR 0020).
//
// Behind the verify-before-flip leader_surface gate (enforced by requireLeader),
// a logged-in leader lands here and sees the group(s) they lead, each with an
// entry into its care space (group-scoped Care Notes + Prayer Requests, ADR 0020)
// and its calendar. It deliberately has NO check-in entry points: check-ins stay
// frozen behind their own `check_ins` gate (decoupled from leader_surface, #376),
// and per ADR 0016 the assignment / headcount UI stays hidden — this surface is
// about caring for the group, not counting it.
export default async function LeaderPage() {
  const session = await requireLeader();
  const user = toShellUser(session.profile);

  const client = await createSupabaseServerClient();
  const groupIds = session.assignedGroupIds;

  // The first-run "seen" flag (#560) and the groups read are independent, so
  // fetch them in parallel rather than paying two serial round-trips on first
  // paint. A failed/absent orientation read degrades to "seen" so the card
  // never nags on a flaky load.
  let orientationSeen = true;
  let groups: LeaderSafeGroupRow[] = [];
  if (client) {
    const reads = bindLeaderReads(client);
    const [seen, groupsResult] = await Promise.all([
      readFirstRunOrientationSeen(client),
      groupIds.length > 0
        ? reads.fetchLeaderGroupsByIds(groupIds)
        : Promise.resolve(null),
    ]);
    orientationSeen = seen;
    if (groupsResult) {
      if (groupsResult.error) throw groupsResult.error;
      // Stable, friendly ordering by name.
      groups = (groupsResult.data ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return (
    <LgAppShell user={user}>
      <PageHeader
        eyebrow="Care"
        title="Your care"
        italic="space"
        lede="A place to care for the groups you lead: note how each is doing, how to pray for it, and keep its calendar."
        maxWidth={MAX_WIDTH}
        actions={<AddToHomeScreenButton />}
      />
      <PageBody maxWidth={MAX_WIDTH}>
        {orientationSeen ? null : <FirstRunCard variant="leader" />}
        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3.5">
            {groups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
        )}
      </PageBody>
    </LgAppShell>
  );
}

function GroupCard({ group }: { group: LeaderSafeGroupRow }) {
  return (
    <section className={cn(cardClassName, "grid max-w-card gap-3")}>
      <div className="grid gap-1">
        <h2 className="m-0 font-display text-lg font-medium text-ink">
          {group.name}
        </h2>
        {group.lifecycle_status === "closed" ? (
          <Badge tone="clay" dot className="justify-self-start">
            Closed
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <Link
          href={`/leader/${group.id}/care`}
          className={buttonClassName("ghost", "sm")}
          aria-label={`Care notes for ${group.name}`}
        >
          Care notes
        </Link>
        <Link
          href={`/leader/${group.id}/calendar`}
          className={buttonClassName("ghost", "sm")}
          aria-label={`Calendar for ${group.name}`}
        >
          Calendar
        </Link>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      className="max-w-card rounded-lg border border-line bg-surface px-6 py-7"
    >
      <p className="m-0 font-sans text-base text-ink2">
        You&rsquo;re signed in, but you&rsquo;re not assigned to lead a group
        right now. When a ministry admin assigns you, your group&rsquo;s care
        space will appear here.
      </p>
    </div>
  );
}
