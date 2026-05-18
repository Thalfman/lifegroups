import { P, fontBody, fontSans } from "@/lib/pastoral";

export function Phase5B1Notice() {
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
        Phase 5B.1 · Live
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
        A read-only review of this week&rsquo;s leader check-ins. See who
        submitted, who&rsquo;s missing, and which groups raised a follow-up
        signal. Editing check-ins isn&rsquo;t part of this surface &mdash;
        head into a group&rsquo;s detail to see the leader&rsquo;s full note
        and attendance.
      </p>
    </aside>
  );
}
