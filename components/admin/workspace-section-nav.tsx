import type { CSSProperties } from "react";
import { P, fontSans } from "@/lib/pastoral";

// Compact in-page section nav for long Super Admin workspaces (Access, Config).
// Plain anchor links: the browser's native hash jump does the scrolling, and the
// anchored sections carry SUPER_ADMIN_STICKY_ANCHOR_OFFSET as scrollMarginTop so
// the target clears the sticky TopBar + workspace tab rail. Deliberately quieter
// than the workspace tabs — small text links on a bare row, no rail chrome — so
// it reads as "jump within this page", not a second tab tier.

export type WorkspaceSection = {
  id: string;
  label: string;
};

export function WorkspaceSectionNav({
  sections,
  ariaLabel,
}: {
  sections: WorkspaceSection[];
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel} style={navStyle}>
      <span style={promptStyle}>On this page:</span>
      {sections.map((section) => (
        <a key={section.id} href={`#${section.id}`} style={linkStyle}>
          {section.label}
        </a>
      ))}
    </nav>
  );
}

const navStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "baseline",
  columnGap: 14,
  rowGap: 6,
  fontFamily: fontSans,
  fontSize: 12.5,
  lineHeight: 1.2,
};

const promptStyle: CSSProperties = {
  color: P.ink3,
  fontWeight: 500,
};

const linkStyle: CSSProperties = {
  color: P.ink2,
  fontWeight: 600,
  textDecoration: "underline",
  textDecorationColor: P.line,
  textUnderlineOffset: 3,
};
