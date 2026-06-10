import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge, STATUS_TONES, type BadgeTone } from "@/components/ui/badge";

// Shared presentational shell for the Danger Zone workflow cards (Super Admin
// redesign).
//
// Every card reads in two visually distinct registers: a rose "destructive"
// register for the delete/reset itself, and a calmer sage "recovery" register
// for the snapshot/revert controls that undo it — so the action that destroys
// data never blends into the controls that recover it.
//
// This module is purely presentational. All type-to-confirm gating, disabled
// conditions, and server actions live unchanged inside the card forms it wraps.

export function DangerCard({
  title,
  intro,
  emphasis = false,
  children,
}: {
  title: string;
  // A string is rendered as the standard lede; pass a node for richer intros.
  intro: ReactNode;
  // The headline "Reset everything" card carries a stronger border.
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-surface",
        emphasis ? "border-rose" : "border-rose/40"
      )}
    >
      {/* roseSoft header strip + status dot — the danger register, carried by
          a tinted full-width strip rather than a stripe. */}
      <div
        className={cn(
          "grid gap-2 border-b bg-roseSoft px-5 py-4",
          emphasis ? "border-rose" : "border-rose/40"
        )}
      >
        <h3 className="m-0 flex items-center gap-2.5 font-display text-lg font-medium text-ink">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-pill bg-rose"
          />
          {title}
        </h3>
        {typeof intro === "string" ? (
          <p className="m-0 font-sans text-sm text-ink2">{intro}</p>
        ) : (
          intro
        )}
      </div>
      <div className="grid gap-3.5 p-5">{children}</div>
    </div>
  );
}

export type DangerPillTone =
  | "ready"
  | "locked"
  | "confirm"
  | "info"
  | "reversible";

// Map the danger-card pill tones onto the design-system Badge vocabulary:
// sage = safe/reversible, amber = needs the confirmation phrase, quiet
// outlines for locked/info.
const PILL_TONE: Record<
  DangerPillTone,
  { tone: BadgeTone; className?: string }
> = {
  ready: { tone: STATUS_TONES.well },
  reversible: { tone: STATUS_TONES.well },
  locked: { tone: "ghost", className: "bg-surface" },
  confirm: { tone: STATUS_TONES.watch },
  info: { tone: "ghost", className: "bg-surface text-ink2" },
};

export function DangerPill({
  label,
  tone,
}: {
  label: string;
  tone: DangerPillTone;
}) {
  const t = PILL_TONE[tone];
  return (
    <Badge tone={t.tone} className={t.className}>
      {label}
    </Badge>
  );
}

// A labeled sub-panel inside a danger card. `variant="recovery"` gives the
// snapshot/revert controls a distinct sage surface so they read as the safety
// net, not the danger.
export function DangerSection({
  variant,
  label,
  status,
  description,
  children,
  style,
}: {
  variant: "destructive" | "recovery";
  label: string;
  status?: { label: string; tone: DangerPillTone };
  description?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const recovery = variant === "recovery";
  return (
    <section
      className={cn(
        "grid gap-2.5 rounded-sm border px-3.5 py-3",
        recovery ? "border-sage bg-sageSoft" : "border-line bg-surface"
      )}
      style={style}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span
          className={cn(
            "font-sans text-sm font-semibold",
            recovery ? "text-sageDeep" : "text-ink3"
          )}
        >
          {label}
        </span>
        {status ? <DangerPill label={status.label} tone={status.tone} /> : null}
      </div>
      {description ? (
        <p className="m-0 font-sans text-sm text-ink2">{description}</p>
      ) : null}
      {children}
    </section>
  );
}
