import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  currentPeriodMonthIso,
  listGroupHealthOverview,
} from "@/lib/admin/group-health-read";
import { recomputeGroupHealthFormAction } from "./actions";

// #127 tracer surface: the attendance-consistency dimension + current
// Group-Health Grade for each active group, for the current month. Admin-only
// (admin layout guard + table RLS). The rated dimensions and override land in
// #128/#129.
export default async function GroupHealthPage() {
  const client = await createSupabaseServerClient();
  if (!client) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Group health</h1>
        <p className="mt-2 text-sm text-gray-600">
          The database isn&apos;t configured, so grades can&apos;t be loaded.
        </p>
      </main>
    );
  }

  const period = currentPeriodMonthIso();
  const rows = await listGroupHealthOverview(client, period);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Group health</h1>
      <p className="mt-1 text-sm text-gray-600">
        Attendance-consistency grade (rolling 8-week average) for {period}. Recompute
        a group to refresh its current-month assessment.
      </p>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">Group</th>
            <th className="py-2 pr-4">Attendance (8-wk avg)</th>
            <th className="py-2 pr-4">Grade</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="py-3 text-gray-600" colSpan={4}>
                No active groups to assess yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.group_id} className="border-b">
                <td className="py-2 pr-4 font-medium">{row.group_name}</td>
                <td className="py-2 pr-4">
                  {row.attendance_pct === null
                    ? "—"
                    : `${Math.round(row.attendance_pct)}% (${row.attendance_weeks_counted} wk)`}
                </td>
                <td className="py-2 pr-4">
                  {row.computed_letter ?? (row.assessed ? "—" : "Not assessed")}
                </td>
                <td className="py-2 pr-4">
                  <form action={recomputeGroupHealthFormAction}>
                    <input type="hidden" name="group_id" value={row.group_id} />
                    <button
                      type="submit"
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Recompute
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
