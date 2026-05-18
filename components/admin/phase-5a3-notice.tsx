import { P, fontBody, fontSans } from "@/lib/pastoral";

export function Phase5A3Notice() {
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
        Phase 5A.3 · Live
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
        Tom&rsquo;s quiet office &mdash; the audit trail of every admin and
        leader action, the one workflow that can change someone&rsquo;s role,
        and a short status board for the underlying system. Members are
        non-auth participant records and don&rsquo;t appear here; they&rsquo;re
        managed through Manage People.
      </p>
    </aside>
  );
}
