import { P, fontBody, fontSans } from "@/lib/pastoral";

export function Phase5A4Notice() {
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
        Phase 5A.4 · Live
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
        Filters, role swaps for leader / co-leader, and per-group metric
        overrides arrived in this phase. Members are still non-login
        participant records &mdash; the directory below makes that clear at a
        glance. Capacity and contact details are optional; groups can be
        created with just a name.
      </p>
    </aside>
  );
}
