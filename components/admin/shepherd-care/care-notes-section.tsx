import type { CSSProperties } from "react";
import { NoteTransparencyToggle } from "@/components/admin/shepherd-care/note-transparency-toggle";
import {
  prayerRequestStatusChipLabel,
  type PrayerRequestStatus,
} from "@/lib/admin/prayer-request-status";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { formatIsoDateOr } from "@/lib/shared/date";
import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";

// Pivot slice 9 (#381 / ADR 0017) — admin Care surface section. Shows the inline
// per-person transparency toggle (Ministry-Admin controlled) plus the Care Notes
// and Prayer Requests this viewer is allowed to read. The reads are already
// RLS-filtered: the ladder sees a subject's sealed notes ONLY when the toggle is
// on, so when `granted` is false the lists below are empty by construction (the
// notes exist but RLS withholds them). The section explains that state inline.
//
// This is a server component: the data is fetched in the page and passed in; the
// only client island is the toggle itself.
const cardStyle = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  padding: 20,
};

const labelStyle = {
  display: "block",
  fontFamily: fontSans,
  fontSize: 10,
  letterSpacing: 1.6,
  textTransform: "uppercase" as const,
  color: P.ink3,
  fontWeight: 600,
  marginBottom: 8,
};

const bodyStyle = {
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
  whiteSpace: "pre-wrap" as const,
  margin: 0,
};

const metaStyle = {
  fontFamily: fontSans,
  fontSize: 11,
  color: P.ink3,
  marginTop: 6,
};

// Issue #474 (plan P2.3) — read-only status chip on a Prayer Request card.
// Mirrors the ShepherdCareStatusBadge pill styling: answered reads as good
// news (sage), archived as a quiet resting state (neutral). Open requests
// render no chip at all — open is the default, not a signal.
const chipBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 10px",
  borderRadius: 999,
  fontFamily: fontSans,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase" as const,
  marginBottom: 6,
};

const chipTones: Record<"answered" | "archived", CSSProperties> = {
  answered: {
    background: P.sageSoft,
    color: P.sageTextStrong,
    border: `1px solid ${P.line}`,
  },
  archived: {
    background: "#ececea",
    color: "#5c5852",
    border: "1px solid #d8d4cd",
  },
};

function PrayerStatusChip({ status }: { status: PrayerRequestStatus }) {
  if (status === "open") return null;
  return (
    <span style={{ ...chipBaseStyle, ...chipTones[status] }}>
      {prayerRequestStatusChipLabel(status)}
    </span>
  );
}

function NoteCard({
  body,
  createdAt,
  context,
  prayerStatus,
}: {
  body: string;
  createdAt: string;
  context?: string;
  // Only Prayer Requests carry a status; Care Notes never pass this.
  prayerStatus?: PrayerRequestStatus;
}) {
  return (
    <li
      style={{
        listStyle: "none",
        borderTop: `1px solid ${P.line2}`,
        paddingTop: 12,
        marginTop: 12,
      }}
    >
      {prayerStatus ? <PrayerStatusChip status={prayerStatus} /> : null}
      <p style={bodyStyle}>{body}</p>
      <p style={metaStyle}>
        {context ? `${context} · ` : ""}
        Recorded {formatIsoDateOr(createdAt, "—")}
      </p>
    </li>
  );
}

// Pivot slice 11 (#382 / ADR 0020): a Care Note / Prayer Request this leader
// wrote ABOUT one of their groups. Carries the group name for context, and —
// for Prayer Requests only (#474) — the pastoral status behind the chip.
export type AuthoredGroupNote = {
  id: string;
  body: string;
  created_at: string;
  groupName: string;
  status?: PrayerRequestStatus;
};

function AuthoredGroupNotes({
  careNotes,
  prayerRequests,
}: {
  careNotes: AuthoredGroupNote[];
  prayerRequests: AuthoredGroupNote[];
}) {
  return (
    <div
      style={{
        borderTop: `1px solid ${P.line}`,
        paddingTop: 16,
        display: "grid",
        gap: 16,
      }}
    >
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
        }}
      >
        Notes this leader wrote about their own group(s). Same toggle gates them
        — they&apos;re sealed to the leader until it&apos;s on.
      </p>
      <div>
        <span style={labelStyle}>About their group ({careNotes.length})</span>
        {careNotes.length === 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink3,
              margin: 0,
            }}
          >
            No group care notes yet.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0 }}>
            {careNotes.map((n) => (
              <NoteCard
                key={n.id}
                body={n.body}
                createdAt={n.created_at}
                context={n.groupName}
              />
            ))}
          </ul>
        )}
      </div>
      <div>
        <span style={labelStyle}>
          Prayer for their group ({prayerRequests.length})
        </span>
        {prayerRequests.length === 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink3,
              margin: 0,
            }}
          >
            No group prayer requests yet.
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0 }}>
            {prayerRequests.map((r) => (
              <NoteCard
                key={r.id}
                body={r.body}
                createdAt={r.created_at}
                context={r.groupName}
                prayerStatus={r.status}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CareNotesSection({
  subjectProfileId,
  granted,
  careNotes,
  prayerRequests,
  authoredGroupCareNotes = [],
  authoredGroupPrayerRequests = [],
}: {
  subjectProfileId: string;
  granted: boolean;
  careNotes: CareNotesRow[];
  prayerRequests: PrayerRequestsRow[];
  // Pivot slice 11 (#382 / ADR 0020): notes this leader authored about their
  // group(s). Same per-leader toggle gates them; default empty (sealed).
  authoredGroupCareNotes?: AuthoredGroupNote[];
  authoredGroupPrayerRequests?: AuthoredGroupNote[];
}) {
  const hasAuthoredGroupNotes =
    authoredGroupCareNotes.length > 0 || authoredGroupPrayerRequests.length > 0;
  return (
    <section style={{ ...cardStyle, display: "grid", gap: 16 }}>
      <div>
        <h3
          style={{
            fontFamily: fontSans,
            fontSize: 15,
            fontWeight: 700,
            color: P.ink,
            margin: "0 0 4px",
          }}
        >
          Care notes &amp; prayer requests
        </h3>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: 0,
          }}
        >
          Over-shepherds write notes about this leader; this leader writes notes
          about their group. Both are private to their author &mdash; leadership
          can read them only when this person&apos;s transparency toggle is on.
        </p>
      </div>

      <NoteTransparencyToggle
        subjectProfileId={subjectProfileId}
        granted={granted}
      />

      {!granted ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
            margin: 0,
          }}
        >
          This person&apos;s notes are sealed to their author. Turn the toggle
          on to let ministry leadership read them.
        </p>
      ) : (
        <>
          <div>
            <span style={labelStyle}>Care notes ({careNotes.length})</span>
            {careNotes.length === 0 ? (
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink3,
                  margin: 0,
                }}
              >
                No care notes yet.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0 }}>
                {careNotes.map((n) => (
                  <NoteCard key={n.id} body={n.body} createdAt={n.created_at} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <span style={labelStyle}>
              Prayer requests ({prayerRequests.length})
            </span>
            {prayerRequests.length === 0 ? (
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink3,
                  margin: 0,
                }}
              >
                No prayer requests yet.
              </p>
            ) : (
              <ul style={{ margin: 0, padding: 0 }}>
                {prayerRequests.map((r) => (
                  <NoteCard
                    key={r.id}
                    body={r.body}
                    createdAt={r.created_at}
                    prayerStatus={r.status}
                  />
                ))}
              </ul>
            )}
          </div>
          {hasAuthoredGroupNotes ? (
            <AuthoredGroupNotes
              careNotes={authoredGroupCareNotes}
              prayerRequests={authoredGroupPrayerRequests}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
