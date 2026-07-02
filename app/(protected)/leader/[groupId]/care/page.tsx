import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { GroupNoteWriteForm } from "@/components/leader/group-note-write-form";
import { requireLeader } from "@/lib/auth/session";
import { toShellUser } from "@/lib/auth/shell-user";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchGroupCareNotes,
  fetchGroupPrayerRequests,
} from "@/lib/supabase/care-note-reads";
import {
  fetchLeaderGroupsByIds,
  type LeaderSafeGroupRow,
} from "@/lib/supabase/group-reads";
import type { PrayerRequestsRow } from "@/types/database";

export const dynamic = "force-dynamic";

type Params = { groupId: string };

// Pivot slice 11 (#382 / ADR 0020): the Leader care surface. A logged-in leader
// (behind the verify-before-flip leader_surface gate, enforced by requireLeader)
// reaches their group's care space: they write author-private Care Notes +
// Prayer Requests ABOUT the group, see what they've written, and can step into
// the group calendar. Per ADR 0020 the notes are GROUP-scoped, not per member —
// the roster (a non-login `members` table) is not shown as care targets here.
export default async function LeaderGroupCarePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { groupId } = await params;

  const session = await requireLeader();
  if (!session.assignedGroupIds.includes(groupId)) {
    redirect("/leader");
  }

  const client = await createSupabaseServerClient();
  if (!client) notFound();

  const [groupResult, careNotesResult, prayerResult] = await Promise.all([
    fetchLeaderGroupsByIds(client, [groupId]),
    fetchGroupCareNotes(client, groupId),
    fetchGroupPrayerRequests(client, groupId),
  ]);

  if (groupResult.error) throw groupResult.error;
  const group = (groupResult.data ?? [])[0] as LeaderSafeGroupRow | undefined;
  if (!group) notFound();
  if (careNotesResult.error) throw careNotesResult.error;
  if (prayerResult.error) throw prayerResult.error;

  const careNotes = careNotesResult.data ?? [];
  const prayerRequests = prayerResult.data ?? [];

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={toShellUser(session.profile)}
      eyebrow="Care"
      title={group.name}
      titleItalic="— care notes"
      lede="A quiet place to note how your group is doing and how to pray for it. Notes stay private to you unless an admin turns your transparency on."
      contentMaxWidth={840}
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <div className="grid gap-4">
        <nav className="flex flex-wrap items-center gap-3 font-sans text-xs text-ink3">
          <Link
            href={`/leader/${groupId}/calendar`}
            className="text-ink2 no-underline hover:text-ink"
            aria-label={`Calendar for ${group.name}`}
          >
            Calendar →
          </Link>
          <span aria-hidden="true" className="ml-auto"></span>
          <Link
            href="/leader"
            className="text-ink2 no-underline hover:text-ink"
          >
            ← Back to dashboard
          </Link>
        </nav>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CareCard
            heading="Care notes"
            blurb="Pastoral notes about your group."
            form={<GroupNoteWriteForm groupId={groupId} kind="care_note" />}
            items={careNotes.map((n) => ({
              id: n.id,
              body: n.body,
              created_at: n.created_at,
            }))}
            emptyMessage="No care notes yet. Add the first one above."
          />
          <CareCard
            heading="Prayer requests"
            blurb="How the team can be praying for your group."
            form={
              <GroupNoteWriteForm groupId={groupId} kind="prayer_request" />
            }
            items={prayerRequests.map((r: PrayerRequestsRow) => ({
              id: r.id,
              body: r.body,
              created_at: r.created_at,
              status: r.status,
            }))}
            emptyMessage="No prayer requests yet. Add the first one above."
          />
        </div>
      </div>
    </PastoralAppShell>
  );
}

type NoteItem = {
  id: string;
  body: string;
  created_at: string;
  status?: string;
};

function CareCard({
  heading,
  blurb,
  form,
  items,
  emptyMessage,
}: {
  heading: string;
  blurb: string;
  form: React.ReactNode;
  items: NoteItem[];
  emptyMessage: string;
}) {
  return (
    <section className="grid content-start gap-3.5 rounded-lg border border-line bg-surface p-card">
      <div className="grid gap-1">
        <h2 className="m-0 font-display text-lg font-medium text-ink">
          {heading}
        </h2>
        <p className="m-0 font-sans text-sm leading-normal text-ink2">
          {blurb}
        </p>
      </div>

      {form}

      <div className="grid gap-2.5">
        {items.length === 0 ? (
          <p className="m-0 font-sans text-sm italic text-ink3">
            {emptyMessage}
          </p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="grid gap-1.5 rounded-sm bg-surfaceAlt px-3 py-2.5"
            >
              <div className="flex items-center gap-2 font-sans text-2xs text-ink3">
                <time dateTime={item.created_at}>
                  {formatNoteDate(item.created_at)}
                </time>
                {item.status ? (
                  <span className="text-2xs text-ink2">· {item.status}</span>
                ) : null}
              </div>
              <p className="m-0 whitespace-pre-wrap font-sans text-base leading-normal text-ink">
                {item.body}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

// Deterministic, timezone-stable date label (UTC) for a note's created_at.
function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
