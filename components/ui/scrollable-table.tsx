import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Horizontal-scroll container for wide data tables (repo-sweep #585). The core
// admin tables (groups, shepherd-care directory, over-shepherds, the Multiply
// grid, the launch-planning scenarios table) are wider than a 375px phone
// viewport. Without a scroll region they'd force whole-page horizontal scroll;
// wrapping them so they scroll inside their own box is the documented fix the
// `responsive-mobile` a11y spec relies on (wide content in an `overflow-x:auto`
// wrapper clips at the wrapper and never widens the page).
//
// A plain block by design (no role/tabindex), so adopting it is behavior- and
// a11y-identical to the hand-rolled `overflow-x-auto` divs it replaces. Pass
// each surface's existing border/rounding/background via `className`.
export function ScrollableTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("overflow-x-auto", className)}>{children}</div>;
}
