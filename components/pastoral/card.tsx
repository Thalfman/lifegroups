import type { CSSProperties, ReactNode } from "react";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

export function PCard({
  title,
  eyebrow,
  action,
  accent,
  pad = true,
  children,
  style,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  accent?: string;
  pad?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: pad ? "22px 24px" : 0,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {accent ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: accent,
          }}
        />
      ) : null}
      {(title || eyebrow || action) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 18,
            padding: pad ? 0 : "22px 24px 0",
          }}
        >
          <div>
            {eyebrow ? (
              <div
                style={{
                  fontFamily: fontSans,
                  fontSize: 10,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: P.ink3,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <div
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: -0.3,
                  color: P.ink,
                }}
              >
                {title}
              </div>
            ) : null}
          </div>
          {action ? (
            <span
              style={{
                fontFamily: fontSans,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: P.terra,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {action}
            </span>
          ) : null}
        </div>
      )}
      <div style={{ padding: pad ? 0 : "0 24px 22px", fontFamily: fontBody }}>
        {children}
      </div>
    </div>
  );
}
