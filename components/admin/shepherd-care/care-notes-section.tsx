import { NoteTransparencyToggle } from "@/components/admin/shepherd-care/note-transparency-toggle";
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

function NoteCard({ body, createdAt }: { body: string; createdAt: string }) {
  return (
    <li
      style={{
        listStyle: "none",
        borderTop: `1px solid ${P.line2}`,
        paddingTop: 12,
        marginTop: 12,
      }}
    >
      <p style={bodyStyle}>{body}</p>
      <p style={metaStyle}>Recorded {formatIsoDateOr(createdAt, "—")}</p>
    </li>
  );
}

export function CareNotesSection({
  subjectProfileId,
  granted,
  careNotes,
  prayerRequests,
}: {
  subjectProfileId: string;
  granted: boolean;
  careNotes: CareNotesRow[];
  prayerRequests: PrayerRequestsRow[];
}) {
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
          Over-shepherds write these privately. Leadership can read them only
          when this person&apos;s transparency toggle is on.
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
                  <NoteCard key={r.id} body={r.body} createdAt={r.created_at} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
