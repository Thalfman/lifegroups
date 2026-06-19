import { cn } from "@/lib/utils";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { CareRowLink } from "@/components/admin/shepherd-care/care-row-link";
import type { CareUpcomingTouchpoint } from "@/lib/admin/shepherd-care-dashboard";

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
          description="Nothing on the calendar for the next 7 days. Schedule a next touchpoint from any shepherd detail page."
        />
      ) : (
        <div>
          {items.map((item) => {
            const overdue = item.daysFromToday < 0;
            return (
              <CareRowLink
                key={item.shepherdProfileId}
                href={item.href}
                title={item.shepherdName}
                subtitle={`Due ${item.dueOn}`}
                trailing={
                  <div
                    className={cn(
                      "whitespace-nowrap font-sans text-xs font-semibold",
                      overdue ? "text-clayDeep" : "text-ink2"
                    )}
                  >
                    {item.relativeLabel}
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </StatusCard>
  );
}
