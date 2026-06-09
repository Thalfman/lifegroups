import { Icon, type IconName } from "@/components/lg/Icon";
import { P, fontSans } from "@/lib/pastoral";

// The console's shared risk/status vocabulary (#451). Every state pairs a
// consistent color + icon so badges read at a glance: good (sage/check),
// guarded (sage outline/shield — protected on purpose), warning
// (mustard/flag), blocked (terra/x), disabled (quiet/dots), active
// (sage/spark), planned (quiet/cal), destructive (solid dark terra/alert —
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
  // Solid dark terra fill — deliberately louder than every soft badge so a
  // destructive action can't pass for an ordinary control. Cream-on-dark-terra
  // keeps AA contrast at badge sizes.
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

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  const s = STATUS_STYLE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: `1px solid ${s.border}`,
        borderRadius: 999,
        background: s.background,
        color: s.color,
        fontFamily: fontSans,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.1,
        lineHeight: 1,
        padding: "6px 9px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={s.icon} size={11} strokeWidth={2.4} />
      {label}
    </span>
  );
}
