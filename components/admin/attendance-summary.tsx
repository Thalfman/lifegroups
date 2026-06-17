import type { AttendanceCounts } from "@/lib/admin/check-ins";

// The "N present · N absent · N excused" inline counts, shared by the weekly
// review row and the per-group detail view. Renders only the figure run (the
// numbers in ink, the labels inheriting their context's color) so each caller
// supplies its own wrapper element / text color.
export function AttendanceSummary({
  attendance,
}: {
  attendance: AttendanceCounts;
}) {
  return (
    <>
      <strong className="font-semibold text-ink">{attendance.present}</strong>{" "}
      present ·{" "}
      <strong className="font-semibold text-ink">{attendance.absent}</strong>{" "}
      absent ·{" "}
      <strong className="font-semibold text-ink">{attendance.excused}</strong>{" "}
      excused
    </>
  );
}
