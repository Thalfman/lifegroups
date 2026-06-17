import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { Badge } from "@/components/ui/badge";
import { shepherdCareInteractionTypeLabel } from "@/lib/dashboard/labels";
import { CareRowLink } from "@/components/admin/shepherd-care/care-row-link";
import type { CareRecentInteraction } from "@/lib/admin/shepherd-care-dashboard";

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
            <CareRowLink
              key={item.id}
              href={item.href}
              title={item.shepherdName}
              subtitle={
                <>
                  {item.interactionAt} · logged {item.createdAt.slice(0, 10)}
                </>
              }
              trailing={
                <Badge tone="sage">
                  {shepherdCareInteractionTypeLabel(item.interactionType)}
                </Badge>
              }
            />
          ))}
        </div>
      )}
    </StatusCard>
  );
}
