import type { ReactNode } from "react";
import { P, fontSans } from "@/lib/pastoral";

// Collapsible operational section for the Super Admin Console (#261).
//
// A native <details> so the disclosure works without JS (collapsed by default);
// the SuperAdminSectionAnchors client controller layers anchor expand + scroll
// + focus on top. Presentation-only: the caller resolves any high-risk `accent`
// (Danger Zone, Test tools) so this primitive stays free of console-specific
// status vocabulary, and the same component is exercised in the a11y harness.

export type SuperAdminSectionAccent = {
  // Border + summary text colour marking the section as visually separated from
  // routine controls.
  border: string;
  color: string;
  // A small status chip rendered in the summary (e.g. "Guarded", "Isolated").
  badge: ReactNode;
};

function SectionChevron() {
  return (
    <span
      className="lg-sac-chevron"
      aria-hidden="true"
      style={{ display: "inline-flex", color: P.ink3 }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M4 2l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function SuperAdminCollapsibleSection({
  id,
  label,
  children,
  accent,
  defaultOpen = false,
}: {
  id: string;
  label: string;
  children: ReactNode;
  accent?: SuperAdminSectionAccent;
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      style={{
        scrollMarginTop: 20,
        background: P.surface,
        border: `1px solid ${accent ? accent.border : P.line}`,
        borderRadius: 12,
        ...(accent ? { boxShadow: `inset 4px 0 0 ${accent.border}` } : null),
      }}
    >
      <summary
        className="lg-sac-summary"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 18px",
          fontFamily: fontSans,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: accent ? accent.color : P.ink2,
        }}
      >
        <SectionChevron />
        <span style={{ flex: 1 }}>{label}</span>
        {accent ? accent.badge : null}
      </summary>
      <div style={{ display: "grid", gap: 18, padding: "4px 18px 20px" }}>
        {children}
      </div>
    </details>
  );
}
