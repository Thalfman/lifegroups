"use client";

import { DangerSection } from "@/components/admin/danger-zone-card-shell";
import { Button } from "@/components/ui/button";
import type { AccountDeletionRequestQueueState } from "@/components/admin/super-admin/console-data";
import { formatIsoDateTimeUtc } from "@/lib/shared/date";

type PendingRequest = Extract<
  AccountDeletionRequestQueueState,
  { status: "loaded" }
>["requests"][number];

export function AccountDeletionRequestQueue({
  queue,
  onReview,
}: {
  queue: AccountDeletionRequestQueueState;
  onReview: (request: PendingRequest) => void;
}) {
  const status =
    queue.status === "failed"
      ? { label: "Unavailable", tone: "locked" as const }
      : queue.status === "empty"
        ? { label: "No pending requests", tone: "info" as const }
        : {
            label: `${queue.requests.length} pending`,
            tone: "confirm" as const,
          };

  return (
    <DangerSection
      variant="destructive"
      label="Account deletion requests"
      status={status}
      description="Review requests here, then continue through the same dependency check and typed confirmation required for every permanent profile deletion."
    >
      {queue.status === "failed" ? (
        <p role="alert" className="m-0 font-sans text-sm text-ink2">
          Account deletion requests could not be loaded. Refresh this page to
          try again.
        </p>
      ) : queue.status === "empty" ? (
        <p className="m-0 font-sans text-sm text-ink2">
          No pending account deletion requests.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {queue.requests.map((request) => (
            <li
              key={request.id}
              className="grid gap-2.5 rounded-sm border border-line bg-surfaceAlt px-3 py-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid gap-0.5">
                  <strong className="font-sans text-sm text-ink">
                    {request.requesterName}
                  </strong>
                  <span className="font-sans text-xs text-ink2">
                    {request.requesterEmail}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-sans text-xs text-ink3">
                  <span>Pending</span>
                  <span aria-hidden="true">&middot;</span>
                  <time dateTime={request.requestedAt}>
                    Requested {formatIsoDateTimeUtc(request.requestedAt)} UTC
                  </time>
                </div>
              </div>
              <div className="grid gap-1">
                <span className="font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
                  Reason
                </span>
                <p className="m-0 whitespace-pre-wrap font-sans text-sm text-ink2">
                  {request.reason?.trim() || "No reason provided."}
                </p>
              </div>
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Review and purge ${request.requesterName}`}
                  onClick={() => onReview(request)}
                >
                  Review and purge
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DangerSection>
  );
}
