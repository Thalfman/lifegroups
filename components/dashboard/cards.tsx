import type { CSSProperties, ReactNode } from "react";

// Shared dashboard primitives, on the design system's card anatomy: border,
// no shadow; sentence-case labels; serif figures. Tone is carried by the
// figure color — never a stripe.

export function MetricCard({
  title,
  value,
  meta,
  accent = "var(--c-clay)",
  valueColor,
  empty = false,
}: {
  title: string;
  value: string;
  meta: string;
  accent?: string;
  valueColor?: string;
  // When true, the value is a labelled empty state ("No data yet") rather than
  // a metric — render it small, muted, and italic so it reads as "nothing to
  // show" instead of a giant cryptic em dash.
  empty?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <div className="mb-2 font-sans text-sm text-ink3">{title}</div>
      {empty ? (
        <div className="py-2 font-sans text-md font-semibold italic leading-tight text-ink3">
          {value}
        </div>
      ) : (
        <div
          className="font-display text-3xl tabular-nums leading-none"
          style={{ color: valueColor ?? accent }}
        >
          {value}
        </div>
      )}
      <div className="mt-2 font-sans text-sm text-ink2">{meta}</div>
    </div>
  );
}

export function StatusCard({
  title,
  eyebrow,
  action,
  children,
  style,
}: {
  title: string;
  eyebrow?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className="rounded-lg border border-line bg-surface p-card"
      style={style}
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          {eyebrow ? (
            <div className="mb-1 font-sans text-xs text-ink3">{eyebrow}</div>
          ) : null}
          <div className="font-display text-lg font-medium text-ink">
            {title}
          </div>
        </div>
        {action ? (
          <span className="shrink-0 font-sans text-sm font-medium text-clay">
            {action}
          </span>
        ) : null}
      </div>
      <div className="font-sans">{children}</div>
    </div>
  );
}

export function ActionCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <StatusCard title={title}>
      <p className="m-0 font-sans text-base text-ink2">{description}</p>
      <div className="mt-3.5 flex flex-wrap gap-2">{action}</div>
    </StatusCard>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-bg px-6 py-7 text-center">
      <div className="font-display text-lg font-medium text-ink">{title}</div>
      <p className="mx-auto mb-0 mt-2 max-w-[480px] font-sans text-sm italic text-ink2">
        {description}
      </p>
    </div>
  );
}

export function LoadingSkeleton({ style }: { style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      className="h-24 animate-pulse rounded-lg bg-lineSoft"
      style={style}
    />
  );
}
