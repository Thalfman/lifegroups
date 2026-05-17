import { cn } from "@/lib/utils";
import type { DashboardSource } from "@/lib/dashboard/types";

const toneMap: Record<DashboardSource, string> = {
  live: "bg-emerald-100 text-emerald-800 border-emerald-200",
  fallback: "bg-amber-100 text-amber-800 border-amber-200",
};

const labelMap: Record<DashboardSource, string> = {
  live: "Live Supabase",
  fallback: "Demo Data",
};

export function DataSourceBadge({ source }: { source: DashboardSource }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        toneMap[source],
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          source === "live" ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {labelMap[source]}
    </span>
  );
}
