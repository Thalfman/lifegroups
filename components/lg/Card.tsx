import type { CSSProperties, ReactNode } from "react";

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-line)",
        borderRadius: 14,
        padding: padded ? "var(--space-card)" : 0,
        boxShadow: "var(--c-shadow)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
