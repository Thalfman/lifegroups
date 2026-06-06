import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { GroupNoteWriteForm } from "@/components/leader/group-note-write-form";
import { requireLeader } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchLeaderGroupsByIds,
  fetchGroupCareNotes,
  fetchGroupPrayerRequests,
  type LeaderSafeGroupRow,
} from "@/lib/supabase/read-models";
import type { PrayerRequestsRow } from "@/types/database";
import { P, fontBody, fontSans } from "@/lib/pastoral";

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
      currentUser={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
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
      <div style={{ display: "grid", gap: 18 }}>
        <nav
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            fontFamily: fontSans,
            fontSize: 12,
            color: P.ink3,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/leader/${groupId}/calendar`}
            style={{ color: P.ink2, textDecoration: "none" }}
            aria-label={`Calendar for ${group.name}`}
          >
            Calendar →
          </Link>
          <span aria-hidden="true" style={{ marginLeft: "auto" }}></span>
          <Link
            href="/leader"
            style={{ color: P.ink2, textDecoration: "none" }}
          >
            ← Back to dashboard
          </Link>
        </nav>

        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
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
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "18px 20px",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <h2
          style={{
            fontFamily: fontSans,
            fontSize: 12,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
            margin: 0,
          }}
        >
          {heading}
        </h2>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {blurb}
        </p>
      </div>

      {form}

      <div style={{ display: "grid", gap: 10 }}>
        {items.length === 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink3,
              margin: 0,
              fontStyle: "italic",
            }}
          >
            {emptyMessage}
          </p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              style={{
                border: `1px solid ${P.line}`,
                borderRadius: 10,
                padding: "10px 12px",
                background: P.bg,
                display: "grid",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontFamily: fontSans,
                  fontSize: 11,
                  color: P.ink3,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <time dateTime={item.created_at}>
                  {formatNoteDate(item.created_at)}
                </time>
                {item.status ? (
                  <span
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      fontSize: 10,
                      color: P.ink2,
                    }}
                  >
                    · {item.status}
                  </span>
                ) : null}
              </div>
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 14,
                  color: P.ink,
                  margin: 0,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
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
