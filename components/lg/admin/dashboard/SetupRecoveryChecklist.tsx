import { Badge, STATUS_TONES } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import {
  buildSetupRecoveryChecklist,
  type SetupRecoveryStatus,
} from "@/lib/dashboard/setup-recovery";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const STATUS_COPY: Record<SetupRecoveryStatus, string> = {
  complete: "Ready",
  needs_action: "Needs action",
  unavailable: "Check",
};

const STATUS_CLASS: Record<SetupRecoveryStatus, string> = {
  complete: "bg-sageSoft text-sageDeep",
  needs_action: "bg-claySoft text-clayDeep",
  unavailable: "bg-surfaceAlt text-ink2",
};

export function SetupRecoveryChecklist({
  data,
  isSuperAdmin = false,
  degraded = false,
}: {
  data: AdminDashboardData;
  isSuperAdmin?: boolean;
  degraded?: boolean;
}) {
  const checklist = buildSetupRecoveryChecklist(data, { isSuperAdmin });
  if (degraded || !checklist.show) return null;

  return (
    <section
      aria-labelledby="setup-recovery-checklist"
      className="grid gap-3 rounded-md border border-line bg-surface px-4 py-4 shadow-soft"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3
            id="setup-recovery-checklist"
            className="m-0 font-display text-xl font-medium text-ink"
          >
            Setup checklist
          </h3>
          <p className="m-0 font-sans text-sm leading-normal text-ink2">
            {checklist.incompleteCount} of {checklist.totalCount} launch steps
            still need attention
            {checklist.setupGapCount > 0
              ? `, including ${checklist.setupGapCount} group setup gaps.`
              : "."}
          </p>
        </div>
        <Badge tone={STATUS_TONES.watch} dot>
          Guided setup
        </Badge>
      </div>

      <ol className="m-0 grid list-none gap-2.5 p-0">
        {checklist.steps.map((step) => (
          <li
            key={step.key}
            className="grid gap-2 rounded-sm border border-lineSoft bg-bg/60 px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sans text-sm font-semibold text-ink">
                  {step.label}
                </span>
                <span
                  className={cn(
                    "rounded-pill px-2 py-0.5 font-sans text-xs font-semibold",
                    STATUS_CLASS[step.status]
                  )}
                >
                  {STATUS_COPY[step.status]}
                </span>
              </div>
              <p className="m-0 mt-1 font-sans text-sm leading-normal text-ink2">
                {step.detail}
              </p>
            </div>
            <LinkButton
              href={step.href}
              variant={step.status === "complete" ? "ghost" : "solid"}
              size="sm"
              aria-label={`${step.actionLabel}: ${step.detail}`}
              className="justify-self-start md:justify-self-end"
            >
              {step.actionLabel}
            </LinkButton>
          </li>
        ))}
      </ol>
    </section>
  );
}
