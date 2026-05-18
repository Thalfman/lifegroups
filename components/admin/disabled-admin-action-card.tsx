import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { PHASE_5A_1_GATE_COPY } from "@/components/admin/phase-gate-notice";

export function DisabledAdminActionCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "20px 22px",
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: -0.2,
          color: P.ink,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13.5,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        {description}
      </p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={PHASE_5A_1_GATE_COPY}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          color: P.ink3,
          border: `1px dashed ${P.line}`,
          padding: "9px 16px",
          borderRadius: 999,
          fontSize: 12,
          fontFamily: fontSans,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          cursor: "not-allowed",
        }}
      >
        Arrives in Phase 5A.1
      </button>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          fontStyle: "italic",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {PHASE_5A_1_GATE_COPY}
      </p>
    </div>
  );
}
