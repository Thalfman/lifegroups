import Link from "next/link";
import { cn } from "@/lib/utils";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import type { CareUpcomingTouchpoint } from "@/lib/admin/shepherd-care-dashboard";

const ROW_LINK =
  "flex min-h-11 items-baseline justify-between gap-3 border-b border-lineSoft py-2.5 text-inherit no-underline transition-colors duration-150 hover:bg-surfaceAlt";

export function UpcomingTouchpointsCard({
  items,
}: {
  items: CareUpcomingTouchpoint[];
}) {
  return (
    <StatusCard eyebrow="This week" title="Upcoming touchpoints">
      {items.length === 0 ? (
        <EmptyState
          title="No touchpoints due"
          description="Nothing on the calendar for the next 7 days. Schedule a next touchpoint from any leader detail page."
        />
      ) : (
        <div>
          {items.map((item) => {
            const overdue = item.daysFromToday < 0;
            return (
              <Link
                key={item.shepherdProfileId}
                href={item.href}
                className={ROW_LINK}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-sans text-base font-semibold text-ink [overflow-wrap:anywhere]">
                    {item.shepherdName}
                  </div>
                  <div className="mt-0.5 font-sans text-sm text-ink3">
                    Due {item.dueOn}
                  </div>
                </div>
                <div
                  className={cn(
                    "whitespace-nowrap font-sans text-xs font-semibold",
                    overdue ? "text-clayDeep" : "text-ink2"
                  )}
                >
                  {item.relativeLabel}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </StatusCard>
  );
}
