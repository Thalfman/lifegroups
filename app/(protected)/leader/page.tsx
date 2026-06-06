import Link from "next/link";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { requireLeader } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchLeaderGroupsByIds,
  type LeaderSafeGroupRow,
} from "@/lib/supabase/read-models";

export const dynamic = "force-dynamic";

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
  const user = {
    name: session.profile.full_name,
    email: session.profile.email,
    role: session.profile.role,
  };
  const MAX_WIDTH = 720;

  const groupIds = session.assignedGroupIds;
  let groups: LeaderSafeGroupRow[] = [];
  if (groupIds.length > 0) {
    const client = await createSupabaseServerClient();
    if (client) {
      const result = await fetchLeaderGroupsByIds(client, groupIds);
      if (result.error) throw result.error;
      groups = result.data ?? [];
      // Stable, friendly ordering by name.
      groups.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return (
    <LgAppShell user={user}>
      <PageHeader
        eyebrow="Care"
        title="Your care"
        italic="space"
        lede="A place to care for the groups you lead — note how each is doing, how to pray for it, and keep its calendar."
        maxWidth={MAX_WIDTH}
      />
      <PageBody maxWidth={MAX_WIDTH}>
        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
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
  const linkStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    color: "var(--c-ink)",
    textDecoration: "none",
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid var(--c-line)",
    background: "var(--c-bg)",
  };
  return (
    <section
      style={{
        border: "1px solid var(--c-line)",
        background: "var(--c-surface)",
        borderRadius: 12,
        padding: "18px 20px",
        display: "grid",
        gap: 12,
        maxWidth: 560,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-serif, var(--font-body))",
            fontSize: 18,
            color: "var(--c-ink)",
          }}
        >
          {group.name}
        </h2>
        {group.lifecycle_status === "closed" ? (
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: "var(--c-clay)",
            }}
          >
            Closed
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href={`/leader/${group.id}/care`}
          style={linkStyle}
          aria-label={`Care notes for ${group.name}`}
        >
          Care notes
        </Link>
        <Link
          href={`/leader/${group.id}/calendar`}
          style={linkStyle}
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
      style={{
        border: "1px solid var(--c-line)",
        background: "var(--c-surface)",
        borderRadius: 12,
        padding: "28px 26px",
        maxWidth: 560,
        fontFamily: "var(--font-body)",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: 1.55,
          color: "var(--c-ink2)",
        }}
      >
        You&rsquo;re signed in, but you&rsquo;re not assigned to lead a group
        right now. When a ministry admin assigns you, your group&rsquo;s care
        space will appear here.
      </p>
    </div>
  );
}
