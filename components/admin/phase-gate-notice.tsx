import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

export const PHASE_5A_1_GATE_COPY =
  "Unlocks in Phase 5A.1 once the narrow admin write policies and server actions are implemented and verified against live Supabase.";

export function PhaseGateNotice() {
  return (
    <div
      role="status"
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderLeft: `3px solid ${P.mustard}`,
        borderRadius: 14,
        padding: "18px 22px",
        fontFamily: fontBody,
        color: P.ink,
      }}
    >
      <p
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: -0.2,
          margin: 0,
        }}
      >
        Pre-launch scaffold — no writes enabled
      </p>
      <p
        style={{
          fontSize: 13.5,
          color: P.ink2,
          fontStyle: "italic",
          lineHeight: 1.55,
          marginTop: 8,
          marginBottom: 0,
        }}
      >
        This page is a structural preview. No live people, roles, group
        assignments, or audit events are loaded, and every action below is
        intentionally disabled.
      </p>
      <ul
        style={{
          marginTop: 14,
          marginBottom: 0,
          paddingLeft: 18,
          display: "grid",
          gap: 6,
          fontSize: 13,
          color: P.ink2,
          lineHeight: 1.55,
        }}
      >
        <li>
          <strong
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: P.terra,
              fontWeight: 600,
              fontStyle: "normal",
            }}
          >
            Phase 5A.1
          </strong>{" "}
          enables narrow writes for admin people, role changes, and group
          assignments — gated by allowlisted columns and RLS policies.
        </li>
        <li>
          <strong
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: P.terra,
              fontWeight: 600,
              fontStyle: "normal",
            }}
          >
            Phase 5B
          </strong>{" "}
          enables operational writes: attendance submission, guest capture, and
          follow-up updates.
        </li>
      </ul>
    </div>
  );
}
