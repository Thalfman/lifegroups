import { Badge, STATUS_TONES, type BadgeTone } from "@/components/ui/badge";
import {
  capacityCategoryLabel,
  healthCategoryLabel,
  lifecycleCategoryLabel,
  setupCategoryLabel,
  type GroupCapacityCategory,
  type GroupHealthCategory,
  type GroupLifecycleCategory,
  type GroupSetupCategory,
} from "@/lib/dashboard/labels";

// Each of the four independent status categories carries its own badge tone.
// They are shown as four separate chips — never combined into one (issue #300).
// No-news values (active, setup complete, no concerns, open) read as quiet
// ghost chips so the only colored chips on a row are the ones asking for a
// look — the four zones stay independent but no longer carry equal visual
// weight.
const LIFECYCLE_TONE: Record<GroupLifecycleCategory, BadgeTone> = {
  active: "ghost",
  paused: "neutral",
  archived: "neutral",
};

const SETUP_TONE: Record<GroupSetupCategory, BadgeTone> = {
  complete: "ghost",
  needs_setup: STATUS_TONES.watch,
  needs_leader: STATUS_TONES.followUp,
  missing_meeting: STATUS_TONES.watch,
};

const HEALTH_TONE: Record<GroupHealthCategory, BadgeTone> = {
  not_assessed: "neutral",
  no_concerns: "ghost",
  needs_attention: STATUS_TONES.followUp,
};

const CAPACITY_TONE: Record<GroupCapacityCategory, BadgeTone> = {
  open: "ghost",
  near_full: STATUS_TONES.watch,
  full: STATUS_TONES.followUp,
};

// The four status chips, one per independent category. Each renders the exact
// same Badge markup the card and table modes used inline, so both surfaces read
// identically — the tone map + label are the single source of truth.
export function LifecycleBadge({
  category,
}: {
  category: GroupLifecycleCategory;
}) {
  return (
    <Badge tone={LIFECYCLE_TONE[category]} dot>
      {lifecycleCategoryLabel(category)}
    </Badge>
  );
}

export function SetupBadge({ category }: { category: GroupSetupCategory }) {
  return (
    <Badge tone={SETUP_TONE[category]} dot>
      {setupCategoryLabel(category)}
    </Badge>
  );
}

export function HealthBadge({ category }: { category: GroupHealthCategory }) {
  return (
    <Badge tone={HEALTH_TONE[category]} dot>
      {healthCategoryLabel(category)}
    </Badge>
  );
}

export function CapacityBadge({
  category,
}: {
  category: GroupCapacityCategory;
}) {
  return (
    <Badge tone={CAPACITY_TONE[category]} dot>
      {capacityCategoryLabel(category)}
    </Badge>
  );
}
