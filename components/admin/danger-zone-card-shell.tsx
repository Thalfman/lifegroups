import type { CSSProperties, ReactNode } from "react";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

// Shared presentational shell for the Danger Zone workflow cards (Super Admin
// redesign).
//
// Every card reads in two visually distinct registers: a terra "destructive"
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
  // A string is rendered as the standard terra lede; pass a node for richer
  // intros.
  intro: ReactNode;
  // The headline "Reset everything" card carries a heavier border.
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: P.terraSoft,
        border: `${emphasis ? 2 : 1}px solid ${P.terra}`,
        borderRadius: 10,
        padding: "18px 22px",
        display: "grid",
        gap: 14,
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <h3
          style={{
            fontFamily: fontDisplay,
            fontSize: 18,
            fontWeight: 600,
            color: P.ink,
            margin: 0,
          }}
        >
          {title}
        </h3>
        {typeof intro === "string" ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.terraTextStrong,
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            {intro}
          </p>
        ) : (
          intro
        )}
      </div>
      {children}
    </div>
  );
}

export type DangerPillTone =
  | "ready"
  | "locked"
  | "confirm"
  | "info"
  | "reversible";

const PILL_STYLE: Record<
  DangerPillTone,
  { bg: string; border: string; color: string }
> = {
  ready: { bg: P.sageSoft, border: P.sage, color: P.sageTextStrong },
  reversible: { bg: P.sageSoft, border: P.sage, color: P.sageTextStrong },
  locked: { bg: P.surface, border: P.line, color: P.ink3 },
  confirm: { bg: P.mustardSoft, border: P.mustard, color: P.mustardTextStrong },
  info: { bg: P.surface, border: P.line, color: P.ink2 },
};

export function DangerPill({
  label,
  tone,
}: {
  label: string;
  tone: DangerPillTone;
}) {
  const s = PILL_STYLE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${s.border}`,
        borderRadius: 999,
        background: s.bg,
        color: s.color,
        fontFamily: fontSans,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 1,
        lineHeight: 1,
        padding: "5px 8px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
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
      style={{
        background: P.surface,
        border: `1px solid ${recovery ? P.sage : P.line}`,
        borderRadius: 8,
        ...(recovery ? { boxShadow: `inset 3px 0 0 ${P.sage}` } : null),
        padding: "12px 14px",
        display: "grid",
        gap: 10,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: recovery ? P.sageTextStrong : P.ink3,
            fontWeight: 700,
          }}
        >
          {label}
        </span>
        {status ? <DangerPill label={status.label} tone={status.tone} /> : null}
      </div>
      {description ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink2,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {description}
        </p>
      ) : null}
      {children}
    </section>
  );
}
