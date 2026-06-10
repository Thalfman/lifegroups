import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  OVERVIEW_GRAINS,
  overviewGrainChip,
  type OverviewGrain,
} from "@/lib/admin/overview-period";

// Week / month / quarter / year / all-time slicer for the activity band. Plain
// links (no client JS) — selecting a grain sets ?period= and re-renders the
// server page; all-time links to the bare /admin for a clean default URL.
export function PeriodSlicer({ current }: { current: OverviewGrain }) {
  return (
    <div
      role="group"
      aria-label="Activity period"
      className="inline-flex flex-wrap gap-1 rounded-pill border border-line bg-bg p-1"
    >
      {OVERVIEW_GRAINS.map((grain) => {
        const active = grain === current;
        return (
          <Link
            key={grain}
            href={grain === "all" ? "/admin" : `/admin?period=${grain}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-pill border px-3 py-1.5 font-sans text-sm no-underline transition-colors duration-150",
              active
                ? "border-line bg-surface font-semibold text-ink"
                : "border-transparent font-medium text-ink2 hover:bg-surface/60"
            )}
          >
            {overviewGrainChip(grain)}
          </Link>
        );
      })}
    </div>
  );
}
