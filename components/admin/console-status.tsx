import { Icon, type IconName } from "@/components/lg/Icon";
import { Badge, STATUS_TONES, type BadgeTone } from "@/components/ui/badge";
import { P } from "@/lib/pastoral";

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

// Legacy CSSProperties-style export kept for the surfaces that still consume
// the raw color values (care directory, capacity board, calendar grid). New
// code should use StatusBadge / STATUS_BADGE_TONE instead.
export const STATUS_STYLE: Record<
  StatusTone,
  { background: string; border: string; color: string; icon: IconName }
> = {
  good: {
    background: P.sageSoft,
    border: P.sage,
    color: P.sageTextStrong,
    icon: "check",
  },
  guarded: {
    background: P.surface,
    border: P.sage,
    color: P.sageTextStrong,
    icon: "shield",
  },
  warning: {
    background: P.mustardSoft,
    border: P.mustard,
    color: P.mustardTextStrong,
    icon: "flag",
  },
  blocked: {
    background: P.terraSoft,
    border: P.terra,
    color: P.terraTextStrong,
    icon: "x",
  },
  disabled: {
    background: P.surface,
    border: P.line,
    color: P.ink3,
    icon: "dots",
  },
  active: {
    background: P.sageSoft,
    border: P.sage,
    color: P.sageTextStrong,
    icon: "spark",
  },
  planned: {
    background: P.surface,
    border: P.line,
    color: P.ink2,
    icon: "cal",
  },
  // Solid rose fill — deliberately louder than every soft badge so a
  // destructive action can't pass for an ordinary control.
  destructive: {
    background: P.terraTextStrong,
    border: P.terraTextStrong,
    color: P.surface,
    icon: "alert",
  },
  readonly: {
    background: P.surface,
    border: P.line,
    color: P.ink2,
    icon: "book",
  },
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
      <Icon name={STATUS_STYLE[tone].icon} size={11} strokeWidth={2.4} />
      {label}
    </Badge>
  );
}
