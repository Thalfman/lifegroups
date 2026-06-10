import Link from "next/link";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { Badge } from "@/components/ui/badge";
import { shepherdCareInteractionTypeLabel } from "@/lib/dashboard/labels";
import type { CareRecentInteraction } from "@/lib/admin/shepherd-care-dashboard";

const ROW_LINK =
  "flex min-h-11 items-baseline justify-between gap-3 border-b border-lineSoft py-2.5 text-inherit no-underline transition-colors duration-150 hover:bg-surfaceAlt";

export function RecentInteractionsCard({
  items,
  available = true,
}: {
  items: CareRecentInteraction[];
  // False when the recent-interactions read failed. The card renders an
  // explicit "temporarily unavailable" state instead of the zero-data
  // empty state so admins don't read a transient DB error as "nothing
  // has been logged."
  available?: boolean;
}) {
  return (
    <StatusCard eyebrow="Activity" title="Recent interactions">
      {!available ? (
        <EmptyState
          title="Recent interactions unavailable"
          description="We couldn't load the latest interactions just now. Refresh in a moment, or check a specific leader's detail page for their full timeline."
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No interactions logged yet"
          description="Log a call, text, or visit from any leader detail page to start the trail."
        />
      ) : (
        <div>
          {items.map((item) => (
            <Link key={item.id} href={item.href} className={ROW_LINK}>
              <div className="min-w-0 flex-1">
                <div className="font-sans text-base font-semibold text-ink [overflow-wrap:anywhere]">
                  {item.shepherdName}
                </div>
                <div className="mt-0.5 font-sans text-sm text-ink3">
                  {item.interactionAt} · logged {item.createdAt.slice(0, 10)}
                </div>
              </div>
              <Badge tone="sage">
                {shepherdCareInteractionTypeLabel(item.interactionType)}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </StatusCard>
  );
}
