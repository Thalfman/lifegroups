import { P, fontBody, fontSans } from "@/lib/pastoral";
import { formatIsoDateOr } from "@/lib/shared/date";
import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";

// Pivot slice 9 (#381 / ADR 0017) — the Over-Shepherd author's OWN Care Notes +
// Prayer Requests about a Leader they cover, read back so they can see and verify
// what they saved. These are author-private: RLS returns the caller's own rows
// here regardless of the transparency toggle (which only governs whether ministry
// leadership may peek). Read-only; no transparency toggle (that lives in admin
// Care). The rows are fetched in the page and passed in (server component).

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

const emptyStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink3,
  margin: 0,
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

export function MyCareNotes({
  careNotes,
  prayerRequests,
}: {
  careNotes: CareNotesRow[];
  prayerRequests: PrayerRequestsRow[];
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ ...emptyStyle, color: P.ink2 }}>
        Your notes &amp; prayer requests below are private to you. Ministry
        leadership can read them only when this Leader&apos;s transparency toggle
        is turned on.
      </p>
      <div>
        <span style={labelStyle}>Your care notes ({careNotes.length})</span>
        {careNotes.length === 0 ? (
          <p style={emptyStyle}>No care notes yet.</p>
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
          Your prayer requests ({prayerRequests.length})
        </span>
        {prayerRequests.length === 0 ? (
          <p style={emptyStyle}>No prayer requests yet.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0 }}>
            {prayerRequests.map((r) => (
              <NoteCard key={r.id} body={r.body} createdAt={r.created_at} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
