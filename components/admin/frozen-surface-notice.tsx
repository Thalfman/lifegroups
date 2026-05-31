import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

// The explicit "frozen" signal for ADR-0002 surfaces gated behind a default-off
// feature flag (#191 / ADR 0009). Rendered in place of the live surface when
// its flag is not enabled-and-verified, so the surface never reads as silently
// live — nor as broken. It reads as deliberately frozen, with the path back.
export function FrozenSurfaceNotice({
  surfaceLabel,
}: {
  surfaceLabel: string;
}) {
  return (
    <div
      style={{ display: "grid", placeItems: "center", padding: "48px 20px" }}
    >
      <div
        style={{
          maxWidth: 520,
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 12,
          padding: "28px 30px",
          display: "grid",
          gap: 12,
          textAlign: "center",
        }}
      >
        <span
          style={{
            justifySelf: "center",
            fontFamily: fontSans,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: "uppercase",
            color: P.ink3,
            border: `1px solid ${P.line}`,
            borderRadius: 999,
            padding: "5px 10px",
          }}
        >
          Frozen
        </span>
        <h1
          style={{
            fontFamily: fontDisplay,
            fontSize: 22,
            fontWeight: 600,
            color: P.ink,
            margin: 0,
          }}
        >
          {surfaceLabel} is frozen
        </h1>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 14,
            color: P.ink2,
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          This surface is deferred per ADR 0002 and is turned off by default. A
          Super Admin can re-enable it from the Super Admin Console once its
          routes and access policies have been re-verified (ADR 0009). It is
          intentionally frozen, not broken.
        </p>
      </div>
    </div>
  );
}
