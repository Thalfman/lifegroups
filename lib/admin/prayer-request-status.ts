import type { PrayerRequestsRow } from "@/types/database";

// Issue #474 (plan P2.3) — read-only Prayer Request status chips on the
// per-leader Care detail page. A Prayer Request carries a pastoral status
// (open / answered / archived); this maps it to the chip label the prayer
// lists render. Display only: letting an author CHANGE a request's status
// needs a new audited RPC + migration and is tracked as its own issue.
//
// "open" is the resting state of a Prayer Request, so open requests render
// unchanged — no chip (null). Only the two non-open states surface a label.

export type PrayerRequestStatus = PrayerRequestsRow["status"];

export function prayerRequestStatusChipLabel(
  status: PrayerRequestStatus
): string | null {
  switch (status) {
    case "open":
      return null;
    case "answered":
      return "Answered";
    case "archived":
      return "Archived";
  }
}
