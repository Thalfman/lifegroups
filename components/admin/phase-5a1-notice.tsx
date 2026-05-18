import { P, fontBody, fontSans } from "@/lib/pastoral";

export function Phase5A1Notice() {
  return (
    <aside
      role="note"
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderLeft: `3px solid ${P.terra}`,
        borderRadius: 8,
        padding: "18px 22px",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.8,
          textTransform: "uppercase",
          color: P.terra,
          fontWeight: 600,
        }}
      >
        Phase 5A.1 · Live
      </div>
      <p
        style={{
          margin: 0,
          fontFamily: fontBody,
          fontSize: 14,
          lineHeight: 1.55,
          color: P.ink2,
        }}
      >
        Julian&rsquo;s command center for the people-work &mdash; adding leaders,
        recording members, assigning them to groups, and quietly keeping the
        directory true. Every change is recorded in the audit trail below.
        Calendar, texting, prayer requests, and attendance writes ship in
        later phases.
      </p>
    </aside>
  );
}
