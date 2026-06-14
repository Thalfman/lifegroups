import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared empty-state primitive (repo-sweep #588). Before this, ~7 components
// hand-rolled their own "nothing here yet" markup — some a dashed-border card,
// some a line of muted text — drifting in padding, tone, and structure. This
// consolidates the two shapes while leaving every component's pastoral copy and
// domain vocabulary (Leader, Care Note, Prospect, …) passed in by the caller.
//
// Two variants:
//   - "card"   — dashed-border panel with a display-type heading; the
//                primary "this list is empty, here's what to do" prompt.
//   - "inline" — a muted line (optionally with a short description / action)
//                for empty table bodies and inline sub-lists, where a full
//                bordered card would be visually heavy. Callers pass `className`
//                to keep their existing padding / alignment.
export type EmptyStateVariant = "card" | "inline";

export function EmptyState({
  title,
  description,
  action,
  variant = "card",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <div className={cn("font-sans text-sm text-ink3", className)}>
        <p className="m-0">{title}</p>
        {description ? <p className="m-0 mt-1.5">{description}</p> : null}
        {action ? (
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            {action}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-line bg-bg px-6 py-7 text-center",
        className
      )}
    >
      <div className="font-display text-lg font-medium text-ink">{title}</div>
      {description ? (
        <p className="m-0 mt-2 font-sans text-sm leading-normal text-ink2">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          {action}
        </div>
      ) : null}
    </div>
  );
}
