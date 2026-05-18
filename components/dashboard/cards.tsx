import type { CSSProperties, ReactNode } from "react";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

export function MetricCard({
  title,
  value,
  meta,
  accent = P.terra,
  valueColor,
}: {
  title: string;
  value: string;
  meta: string;
  accent?: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "20px 22px",
        position: "relative",
        overflow: "hidden",
      }}
    >
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
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: P.ink3,
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 54,
          fontWeight: 500,
          letterSpacing: -1.8,
          lineHeight: 0.95,
          color: valueColor ?? accent,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          marginTop: 10,
          fontStyle: "italic",
        }}
      >
        {meta}
      </div>
    </div>
  );
}

export function StatusCard({
  title,
  eyebrow,
  action,
  children,
  style,
}: {
  title: string;
  eyebrow?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "22px 24px",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 18,
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
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: -0.3,
              color: P.ink,
            }}
          >
            {title}
          </div>
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
      <div style={{ fontFamily: fontBody }}>{children}</div>
    </div>
  );
}

export function ActionCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <StatusCard title={title}>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        {description}
      </p>
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
        {action}
      </div>
    </StatusCard>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        background: P.bg,
        border: `1px dashed ${P.line}`,
        borderRadius: 14,
        padding: "28px 24px",
        textAlign: "center",
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
          marginTop: 8,
          marginBottom: 0,
          fontStyle: "italic",
          lineHeight: 1.55,
          maxWidth: 480,
          marginInline: "auto",
        }}
      >
        {description}
      </p>
    </div>
  );
}

export function LoadingSkeleton({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 96,
        borderRadius: 14,
        background: P.line2,
        animation: "pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}
