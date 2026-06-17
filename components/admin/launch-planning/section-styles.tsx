import type { CSSProperties, ReactNode } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";

// Shared section chrome for the launch-planning panels. Before this, the
// eyebrow / section-card / panel-title styles were copied byte-for-byte across
// the shell, the plan-launch widget, the scenarios panel, and the panels
// module. Promoting them here keeps the launch-planning surfaces visually
// coherent and the copies from drifting.

// The small uppercase eyebrow label sitting above a section title.
export const eyebrowStyle: CSSProperties = {
  fontFamily: fontSans,
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 600,
};

// The bordered surface card a launch-planning section sits in.
export const sectionStyle: CSSProperties = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 14,
  padding: "22px 24px",
};

// The display-type heading under a section eyebrow.
export const panelTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontFamily: fontBody,
  fontSize: 18,
  color: P.ink,
  fontWeight: 600,
};

// The eyebrow as a component, for callers that render it inline rather than
// applying `eyebrowStyle` to their own element.
export function SectionEyebrow({ children }: { children: ReactNode }) {
  return <span style={eyebrowStyle}>{children}</span>;
}
