import { Icon, type IconName } from "@/components/lg/Icon";
import { Badge, STATUS_TONES, type BadgeTone } from "@/components/ui/badge";

// The console's shared risk/status vocabulary (#451). Every state pairs a
// consistent color + icon so badges read at a glance: good (sage/check),
// guarded (sage outline/shield — protected on purpose), warning
// (amber/flag), blocked (rose/x), disabled (quiet/dots), active
// (sage/spark), planned (quiet/cal), destructive (solid rose/alert —
// must never read as an ordinary badge), readonly (quiet/book — a safe read).
// Lives in its own module (no "use client") so server-rendered shell panels
// and client consoles (danger zone, test accounts) share one vocabulary
// instead of inventing their own.
export type StatusTone =
  | "good"
  | "guarded"
  | "warning"
  | "blocked"
  | "disabled"
  | "active"
  | "planned"
  | "destructive"
  | "readonly";

// Icon per tone — the icon half of the shared vocabulary above.
const STATUS_ICON: Record<StatusTone, IconName> = {
  good: "check",
  guarded: "shield",
  warning: "flag",
  blocked: "x",
  disabled: "dots",
  active: "spark",
  planned: "cal",
  destructive: "alert",
  readonly: "book",
};

// Legacy tone → Tailwind classes (border/background/text) export, kept for the
// super-admin-console-shell re-export and any surface that styles its own
// element. New code should use StatusBadge / STATUS_BADGE_TONE instead.
export const STATUS_STYLE: Record<StatusTone, string> = {
  good: "border-sage bg-sageSoft text-sageDeep",
  guarded: "border-sage bg-surface text-sageDeep",
  warning: "border-amber bg-amberSoft text-amberText",
  blocked: "border-clay bg-claySoft text-clayDeep",
  disabled: "border-line bg-surface text-ink3",
  active: "border-sage bg-sageSoft text-sageDeep",
  planned: "border-line bg-surface text-ink2",
  // Solid fill — deliberately louder than every soft badge so a destructive
  // action can't pass for an ordinary control.
  destructive: "border-clayDeep bg-clayDeep text-surface",
  readonly: "border-line bg-surface text-ink2",
};

// Map every console tone onto the design-system Badge (soft bg + deep fg);
// className extras carry the few looks Badge's tone map doesn't have (the
// outlined "guarded"/quiet tones and the solid destructive fill).
const STATUS_BADGE_TONE: Record<
  StatusTone,
  { tone: BadgeTone; className?: string }
> = {
  good: { tone: STATUS_TONES.well },
  guarded: {
    tone: STATUS_TONES.well,
    className: "border border-sage bg-surface",
  },
  warning: { tone: STATUS_TONES.watch },
  blocked: { tone: STATUS_TONES.concern },
  disabled: { tone: "ghost" },
  active: { tone: STATUS_TONES.well },
  planned: { tone: "ghost", className: "text-ink2" },
  destructive: { tone: STATUS_TONES.concern, className: "bg-rose text-white" },
  readonly: { tone: "ghost", className: "text-ink2" },
};

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  const t = STATUS_BADGE_TONE[tone];
  return (
    <Badge tone={t.tone} className={t.className}>
      <Icon name={STATUS_ICON[tone]} size={11} strokeWidth={2.4} />
      {label}
    </Badge>
  );
}
