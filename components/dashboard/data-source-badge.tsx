import { PBadge } from "@/components/pastoral/atoms";
import type { DashboardSource } from "@/lib/dashboard/types";

const labelMap: Record<DashboardSource, string> = {
  live: "Live Supabase",
  fallback: "Demo Data",
};

export function DataSourceBadge({ source }: { source: DashboardSource }) {
  return (
    <PBadge tone={source === "live" ? "healthy" : "watch"} outline>
      {labelMap[source]}
    </PBadge>
  );
}
