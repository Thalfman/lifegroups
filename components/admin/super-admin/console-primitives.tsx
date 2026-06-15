import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SUPER_ADMIN_STICKY_ANCHOR_OFFSET } from "@/components/admin/super-admin-anchors";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/admin/console-status";
import type {
  ConsoleStatusAction,
  SuperAdminNextAction,
} from "@/lib/admin/super-admin-console-model";

// Card anatomy (design direction §4): surface, line border, no shadow.
export const CARD_CLASS = "rounded-lg border border-line bg-surface p-card";

// Card grids stack on mobile, spread from md (replacing .lg-m-grid-stack).
export const CARD_GRID_CLASS =
  "grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-3.5";
export const TWO_CARD_GRID_CLASS =
  "grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-3.5";

// A small "go do it" link rendered inside status cards. Plain anchor on
// purpose: the workspace switcher already listens for hash changes (including
// the legacy aliases like #test-tools), so `#diagnostics` both flips the tab
// and scrolls to the named section — no new navigation machinery (#454).
export function StatusActionLink({ action }: { action: ConsoleStatusAction }) {
  return (
    <a
      href={`#${action.hash}`}
      className="justify-self-start whitespace-nowrap font-sans text-sm font-semibold text-clay no-underline"
    >
      {action.label} →
    </a>
  );
}

// A compact chip for the always-visible status row: a sentence-case label, a
// status badge, a one-line detail (the plain-language reason when something is
// blocked), and — when the state needs attention — the next best action (#454).
export function StatusChip({
  label,
  value,
  tone,
  detail,
  action,
}: {
  label: string;
  value: string;
  tone: StatusTone;
  detail: string;
  action?: ConsoleStatusAction;
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-xs font-semibold text-ink3">
          {label}
        </span>
        <StatusBadge label={value} tone={tone} />
      </div>
      <span className="font-sans text-xs leading-snug text-ink2">{detail}</span>
      {action ? <StatusActionLink action={action} /> : null}
    </div>
  );
}

export function WorkspaceHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid gap-1.5">
      <h2 className="m-0 font-display text-xl font-semibold text-ink">
        {title}
      </h2>
      <p className="m-0 max-w-[680px] font-sans text-sm text-ink2">
        {description}
      </p>
    </div>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 font-display text-lg font-medium text-ink">
      {children}
    </h3>
  );
}

export function Panel({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  // Optional anchor id so a deep link (e.g. #people-import) can scroll to this
  // panel once its workspace is active. scrollMarginTop clears the sticky
  // TopBar + tab rail so an anchor jump never hides the section under them.
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(CARD_CLASS, "grid gap-3", className)}
      style={
        id ? { scrollMarginTop: SUPER_ADMIN_STICKY_ANCHOR_OFFSET } : undefined
      }
    >
      {children}
    </div>
  );
}

export function CommandCard({
  title,
  description,
  status,
  children,
  id,
}: {
  title: string;
  description: string;
  status?: { label: string; tone: StatusTone };
  children?: ReactNode;
  // Optional anchor id so a deep link can scroll to this card once its
  // workspace is active.
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(CARD_CLASS, "grid content-start gap-2.5")}
      style={
        id ? { scrollMarginTop: SUPER_ADMIN_STICKY_ANCHOR_OFFSET } : undefined
      }
    >
      <div className="flex items-start justify-between gap-2.5">
        <h3 className="m-0 font-display text-lg font-medium text-ink">
          {title}
        </h3>
        {status ? (
          <StatusBadge label={status.label} tone={status.tone} />
        ) : null}
      </div>
      <p className="m-0 font-sans text-sm text-ink2">{description}</p>
      {children}
    </div>
  );
}

export function MetricRow({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex justify-between gap-3 font-sans text-xs text-ink2">
      <span>{label}</span>
      <strong className="text-ink">{value}</strong>
    </div>
  );
}

export function SubsectionHeader({
  title,
  hint,
}: {
  title: string;
  hint: string;
}) {
  return (
    <div className="grid gap-1">
      <h3 className="m-0 font-display text-lg font-medium text-ink">{title}</h3>
      <p className="m-0 font-sans text-sm text-ink2">{hint}</p>
    </div>
  );
}

export function ErrorBanner() {
  return (
    <div
      role="alert"
      className="rounded-sm border border-rose/40 bg-roseSoft px-3.5 py-3 font-sans text-sm text-rose"
    >
      Some data couldn&rsquo;t load. The workspaces below show what did load;
      retry in a moment or check the database connection.
    </div>
  );
}

// Soft background + matching border per tone for the Next-step card (status
// vocabulary: sage = well, amber = watch, rose = concern); the label picks up
// the deep foreground of the same hue.
const NEXT_ACTION_CARD_CLASS: Record<StatusTone, string> = {
  good: "border-sage bg-sageSoft",
  guarded: "border-sage bg-surface",
  warning: "border-amber bg-amberSoft",
  blocked: "border-rose/40 bg-roseSoft",
  disabled: "border-line bg-surface",
  active: "border-sage bg-sageSoft",
  planned: "border-line bg-surface",
  destructive: "border-rose bg-roseSoft",
  readonly: "border-line bg-surface",
};

const NEXT_ACTION_LABEL_CLASS: Record<StatusTone, string> = {
  good: "text-sageDeep",
  guarded: "text-sageDeep",
  warning: "text-amberText",
  blocked: "text-rose",
  disabled: "text-ink3",
  active: "text-sageDeep",
  planned: "text-ink2",
  destructive: "text-rose",
  readonly: "text-ink2",
};

export function NextActionCard({ action }: { action: SuperAdminNextAction }) {
  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-lg border px-5 py-4",
        NEXT_ACTION_CARD_CLASS[action.tone]
      )}
    >
      <div className="flex items-center justify-between gap-2.5">
        <span
          className={cn(
            "font-sans text-xs font-semibold",
            NEXT_ACTION_LABEL_CLASS[action.tone]
          )}
        >
          Next step
        </span>
        <StatusBadge
          label={action.tone === "good" ? "Ready" : "Action"}
          tone={action.tone}
        />
      </div>
      <h3 className="m-0 font-display text-lg font-medium text-ink">
        {action.title}
      </h3>
      <p className="m-0 font-sans text-sm text-ink2">{action.body}</p>
      {action.action ? <StatusActionLink action={action.action} /> : null}
    </div>
  );
}
