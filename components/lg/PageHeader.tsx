import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  italic,
  lede,
  actions,
  children,
  maxWidth = 1240,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  italic?: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div
      className="mx-auto w-full px-4 pb-4 pt-[22px] md:px-10 md:pb-6 md:pt-9"
      style={{ maxWidth }}
    >
      <div className="flex flex-wrap items-end justify-between gap-7">
        <div className="min-w-0">
          {/* The page kicker — the one tracked-uppercase voice per page. */}
          {eyebrow ? (
            <div className="mb-2.5 font-sans text-2xs font-semibold uppercase tracking-[0.18em] text-clay">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="m-0 font-display text-3xl font-normal text-ink md:text-4xl">
            {title}
            {italic ? (
              <span className="italic text-ink2"> {italic}</span>
            ) : null}
          </h1>
          {lede ? (
            <p className="mb-0 mt-3 max-w-lede font-sans text-base text-ink2">
              {lede}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div>
        ) : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}

export function PageBody({
  children,
  maxWidth = 1240,
  style,
}: {
  children: ReactNode;
  maxWidth?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="mx-auto w-full px-4 pb-8 md:px-10 md:pb-16"
      style={{ maxWidth, ...style }}
    >
      {children}
    </div>
  );
}
