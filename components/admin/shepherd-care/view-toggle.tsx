import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  buildShepherdCareViewHref,
  type CoverageFilter,
  type DirectoryFilter,
  type ShepherdCareView,
} from "@/lib/admin/shepherd-care-view";

// Segmented Dashboard | Directory control under the Leader-care page header
// (#178). One nav item, one route; this just flips the `?view=` param while
// carrying the current filter / coverage selection across, so the chosen view
// is bookmarkable.

function segmentClassName(active: boolean): string {
  return cn(
    "inline-flex items-center rounded-pill px-4 py-1.5 font-sans text-sm font-medium no-underline transition-colors duration-150",
    active
      ? "bg-surface text-ink shadow-soft"
      : "bg-transparent text-ink2 hover:bg-surface/60"
  );
}

export function ShepherdCareViewToggle({
  current,
  filter,
  coverage,
}: {
  current: ShepherdCareView;
  filter: DirectoryFilter;
  coverage: CoverageFilter | undefined;
}) {
  const segments: { view: ShepherdCareView; label: string }[] = [
    { view: "dashboard", label: "Dashboard" },
    { view: "directory", label: "Directory" },
  ];
  return (
    <nav
      aria-label="Shepherd care view"
      className="inline-flex gap-0.5 rounded-pill border border-line bg-bg p-[3px]"
    >
      {segments.map((s) => (
        <Link
          key={s.view}
          href={buildShepherdCareViewHref({ view: s.view, filter, coverage })}
          aria-current={current === s.view ? "page" : undefined}
          className={segmentClassName(current === s.view)}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
