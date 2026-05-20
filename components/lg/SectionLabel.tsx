import type { ReactNode } from "react";

export function SectionLabel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.8,
          color: "var(--c-ink3)",
          fontWeight: 600,
        }}
      >
        {children}
      </div>
      {hint ? (
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--c-ink3)",
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
