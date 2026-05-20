import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  italic,
  lede,
  actions,
  children,
  maxWidth = 1240,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  italic?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      className="lg-shell-pageheader"
      style={{
        padding: "36px 40px 24px",
        maxWidth,
        margin: "0 auto",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {eyebrow ? (
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "var(--c-clay)",
                fontWeight: 600,
                marginBottom: 10,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "calc(38px * var(--font-scale))",
              lineHeight: 1.08,
              fontWeight: 400,
              color: "var(--c-ink)",
              letterSpacing: -0.5,
            }}
          >
            {title}
            {italic ? (
              <span style={{ fontStyle: "italic", color: "var(--c-ink2)" }}>
                {" "}
                {italic}
              </span>
            ) : null}
          </h1>
          {lede ? (
            <p
              style={{
                margin: "12px 0 0",
                maxWidth: 640,
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--c-ink2)",
              }}
            >
              {lede}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            style={{
              display: "flex",
              gap: 10,
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            {actions}
          </div>
        ) : null}
      </div>
      {children ? <div style={{ marginTop: 24 }}>{children}</div> : null}
    </div>
  );
}

export function PageBody({
  children,
  maxWidth = 1240,
  style,
}: {
  children: ReactNode;
  maxWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="lg-shell-pagebody"
      style={{
        padding: "0 40px 64px",
        maxWidth,
        margin: "0 auto",
        width: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
