import { PBadge } from "@/components/pastoral/atoms";
import type { SessionReviewStatus } from "@/lib/admin/check-ins";

// The shared check-in session-status badge, used by both the weekly review list
// and the per-group detail view so the two surfaces label a session's state
// identically. `isScheduledThisWeek` defaults to true: a missing session reads
// as "Missing" unless a bi-weekly off-parity group wasn't scheduled to meet
// this week, in which case it reads as the calmer "Off-week" (the detail view,
// which always concerns a scheduled week, omits the prop).
export function SessionStatusBadge({
  status,
  isScheduledThisWeek = true,
}: {
  status: SessionReviewStatus;
  isScheduledThisWeek?: boolean;
}) {
  switch (status) {
    case "submitted":
      return <PBadge tone="healthy">Submitted</PBadge>;
    case "admin_entered":
      return (
        <PBadge tone="healthy" outline>
          Submitted · admin
        </PBadge>
      );
    case "missing":
      // Bi-weekly off-parity groups shouldn't be accused of missing a
      // check-in for a week they weren't scheduled to meet. Surface them
      // as "Off-week" instead so admins know nothing is broken.
      if (!isScheduledThisWeek) {
        return (
          <PBadge tone="neutral" outline>
            Off-week
          </PBadge>
        );
      }
      return <PBadge tone="followup">Missing</PBadge>;
    case "did_not_meet":
      return <PBadge tone="neutral">Did not meet</PBadge>;
    case "planned_pause":
      return <PBadge tone="pause">Planned pause</PBadge>;
    default:
      return <PBadge tone="neutral">{status}</PBadge>;
  }
}
