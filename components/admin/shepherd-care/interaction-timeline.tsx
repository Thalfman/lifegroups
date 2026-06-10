import { Badge } from "@/components/ui/badge";
import { shepherdCareInteractionTypeLabel } from "@/lib/dashboard/labels";
import { formatIsoDate } from "@/lib/shared/date";
import type { ShepherdCareInteractionsRow } from "@/types/database";

export function InteractionTimeline({
  interactions,
}: {
  interactions: ShepherdCareInteractionsRow[];
}) {
  if (interactions.length === 0) {
    return (
      <div className="py-5 font-sans text-sm text-ink3">
        No interactions logged yet.
      </div>
    );
  }
  return (
    <div role="list">
      {interactions.map((row) => (
        <div
          key={row.id}
          role="listitem"
          className="grid grid-cols-[auto,1fr] gap-4 border-b border-lineSoft py-3.5"
        >
          <div className="whitespace-nowrap font-sans text-xs font-medium text-ink3">
            {formatIsoDate(row.interaction_at)}
          </div>
          <div>
            <div className="mb-1.5">
              <Badge tone="neutral">
                {shepherdCareInteractionTypeLabel(row.interaction_type)}
              </Badge>
            </div>
            {row.notes ? (
              <p className="m-0 whitespace-pre-wrap font-sans text-base text-ink">
                {row.notes}
              </p>
            ) : (
              <p className="m-0 whitespace-pre-wrap font-sans text-base italic text-ink3">
                No notes recorded.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
