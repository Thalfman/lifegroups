import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PCard({
  title,
  eyebrow,
  action,
  accent,
  pad = true,
  children,
  style,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  // Tone color (a P.* / var(--c-*) value). Rendered as a leading status dot
  // beside the title — never a side/top stripe (design direction §4 Cards).
  accent?: string;
  pad?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-surface",
        pad && "p-card"
      )}
      style={style}
    >
      {(title || eyebrow || action) && (
        <div
          className={cn(
            "mb-4 flex items-baseline justify-between gap-3",
            !pad && "px-card pt-card"
          )}
        >
          <div>
            {eyebrow ? (
              <div className="mb-1 font-sans text-xs text-ink3">{eyebrow}</div>
            ) : null}
            {title ? (
              <div className="flex items-baseline gap-2 font-display text-lg font-medium text-ink">
                {accent ? (
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 self-center rounded-pill"
                    style={{ background: accent }}
                  />
                ) : null}
                {title}
              </div>
            ) : null}
          </div>
          {action ? (
            <span className="shrink-0 font-sans text-sm font-medium text-clay">
              {action}
            </span>
          ) : null}
        </div>
      )}
      <div className={cn("font-sans", !pad && "px-card pb-card")}>
        {children}
      </div>
    </div>
  );
}
