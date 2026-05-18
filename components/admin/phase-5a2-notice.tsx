import { P, fontBody, fontSans } from "@/lib/pastoral";

export function Phase5A2Notice() {
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
        Phase 5A.2 · Live
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
        Create new Life Groups, edit the details, and close groups when they
        wrap up. Nothing is ever deleted &mdash; closed groups stay in the
        record and can be reopened. Audit visibility is limited to the super
        admin from this phase forward.
      </p>
    </aside>
  );
}
