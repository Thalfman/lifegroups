import type { ReactNode } from "react";

// Shared section chrome for the launch-planning panels. Before this, the
// eyebrow / section-card / panel-title styles were copied byte-for-byte across
// the shell, the plan-launch widget, the scenarios panel, and the panels
// module. Promoting them here keeps the launch-planning surfaces visually
// coherent and the copies from drifting.

// The small uppercase eyebrow label sitting above a section title.
export const eyebrowClassName =
  "font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-ink3";

// The bordered surface card a launch-planning section sits in.
export const sectionClassName =
  "rounded-lg border border-line bg-surface px-6 py-[22px]";

// The display-type heading under a section eyebrow.
export const panelTitleClassName =
  "m-0 mt-1 font-sans text-[18px] font-semibold text-ink";

// The eyebrow as a component, for callers that render it inline rather than
// applying `eyebrowClassName` to their own element.
export function SectionEyebrow({ children }: { children: ReactNode }) {
  return <span className={eyebrowClassName}>{children}</span>;
}
