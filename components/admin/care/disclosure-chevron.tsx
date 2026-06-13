import { cn } from "@/lib/utils";

// The Care accordion's disclosure marker. Reuses the house `lg-sac-chevron`
// convention (globals.css) so it rotates 90° when its parent <details> is open
// — the same affordance the Super Admin Console collapsibles use, and already
// covered by the global reduced-motion guard. Shared across all three Care
// disclosure levels (Over-Shepherd pane, Leader, Grades & notes) so the open/
// closed cue is identical at every depth. Decorative — the <summary> it sits in
// carries the accessible toggle semantics.
export function DisclosureChevron({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("lg-sac-chevron inline-flex shrink-0 text-ink3", className)}
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
