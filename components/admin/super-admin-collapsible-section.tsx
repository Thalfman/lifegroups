import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Collapsible operational section for the Super Admin Console (#261).
//
// A native <details> so the disclosure works without JS (collapsed by default);
// the SuperAdminSectionAnchors client controller layers anchor expand + scroll
// + focus on top. Presentation-only: the caller resolves any high-risk `accent`
// (Danger Zone, Test tools) so this primitive stays free of console-specific
// status vocabulary, and the same component is exercised in the a11y harness.

export type SuperAdminSectionAccent = {
  // Border + summary text colour marking the section as visually separated from
  // routine controls. Caller-resolved values (e.g. var(--c-rose)), so they stay
  // inline styles here — the only dynamic colors this primitive carries.
  border: string;
  color: string;
  // A small status chip rendered in the summary (e.g. "Guarded", "Isolated").
  badge: ReactNode;
};

function SectionChevron() {
  return (
    <span className="lg-sac-chevron inline-flex text-ink3" aria-hidden="true">
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
      className={cn(
        "scroll-mt-5 rounded-md border bg-surface",
        !accent && "border-line"
      )}
      style={accent ? { borderColor: accent.border } : undefined}
    >
      <summary
        className={cn(
          "lg-sac-summary flex items-center gap-2.5 px-[18px] py-3.5 font-sans text-sm font-semibold",
          !accent && "text-ink2"
        )}
        style={accent ? { color: accent.color } : undefined}
      >
        <SectionChevron />
        <span className="flex-1">{label}</span>
        {accent ? accent.badge : null}
      </summary>
      <div className="grid gap-[18px] px-[18px] pb-5 pt-1">{children}</div>
    </details>
  );
}
