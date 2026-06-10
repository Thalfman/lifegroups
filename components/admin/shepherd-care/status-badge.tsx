import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { ShepherdCareStatus } from "@/types/enums";
import { shepherdCareStatusLabel } from "@/lib/dashboard/labels";

// Care statuses on the design system's status vocabulary: doing well → sage ·
// needs encouragement → amber (watch) · needs follow-up → clay · concern →
// rose · inactive → neutral. Soft background + Deep foreground, with a dot.
const TONES: Record<ShepherdCareStatus, BadgeTone> = {
  doing_well: "sage",
  needs_encouragement: "amber",
  needs_follow_up: "clay",
  concern: "rose",
  inactive: "neutral",
};

export function ShepherdCareStatusBadge({
  status,
}: {
  status: ShepherdCareStatus;
}) {
  return (
    <Badge tone={TONES[status]} dot>
      {shepherdCareStatusLabel(status)}
    </Badge>
  );
}
