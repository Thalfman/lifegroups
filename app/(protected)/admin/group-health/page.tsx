import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  currentPeriodMonthIso,
  listGroupHealthOverview,
} from "@/lib/admin/group-health-read";
import { resolveGroupGradeBoard } from "@/lib/admin/group-health-grades";
import { fetchPlatformConfig } from "@/lib/supabase/read-models";
import { decodeAppConfig } from "@/lib/admin/app-config-decode";
import { GROUP_HEALTH_COPY_KEYS, resolveCopy } from "@/lib/admin/editable-copy";
import {
  recomputeGroupHealthFormAction,
  setGroupHealthRatingsFormAction,
} from "./actions";

// #127 tracer surface, extended for #128: the attendance-consistency dimension,
// the two admin-entered 1–5 ratings (spiritual growth + relayed group
// question), and the current Group-Health Grade for each active group,
// recomputed live on read for the current month. Admin-only (admin layout guard
// + table RLS). The override lands in #129.
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
  const overview = await listGroupHealthOverview(client, period);

  // Phase SAC.2 (#162): the two question wordings are operator-editable via the
  // Super Admin Console. platform_config is Super-Admin-only via RLS, so for a
  // ministry_admin this read returns null and decodeAppConfig yields {} — which
  // makes resolveCopy fall back to the documented placeholders. That graceful
  // fallback is the intended behaviour, not an error.
  const platformConfig = await fetchPlatformConfig(client);
  const editableCopy = decodeAppConfig(platformConfig.data).editableCopy;
  const spiritualGrowthLabel = resolveCopy(
    editableCopy,
    GROUP_HEALTH_COPY_KEYS.spiritualGrowth
  );
  const groupQuestionLabel = resolveCopy(
    editableCopy,
    GROUP_HEALTH_COPY_KEYS.groupQuestion
  );

  if (overview.error) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Group health</h1>
        <p className="mt-2 text-sm text-red-700">
          Couldn&apos;t load group-health grades. Refresh to try again.
        </p>
      </main>
    );
  }

  // Resolve each group's effective grade and rank best-to-worst (ungraded
  // last) through the one Group-Health Grade facade, so the groups that need
  // attention surface together (PRD Q12 Job 3 / #129). Overrides land with
  // #129; an empty map ranks by the computed letter as-is.
  const rowsById = new Map(overview.data.map((row) => [row.group_id, row]));
  const board = resolveGroupGradeBoard(
    overview.data.map((row) => ({
      group_id: row.group_id,
      group_name: row.group_name,
      computed_letter: row.computed_letter,
    })),
    new Map(),
    period
  );
  const rows = board.ranked.map((g) => rowsById.get(g.group_id)!);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Group health</h1>
      <p className="mt-1 text-sm text-gray-600">
        Group-Health Grade for {period}, recomputed live from attendance
        consistency (rolling 8-week average) and your 1–5 ratings. Saving a
        rating or saving the grade writes the current snapshot to the
        month&apos;s history.
      </p>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 pr-4">Group</th>
            <th className="py-2 pr-4">Attendance (8-wk avg)</th>
            <th className="py-2 pr-4">Spiritual growth</th>
            <th className="py-2 pr-4">Group question</th>
            <th className="py-2 pr-4">Grade</th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="py-3 text-gray-600" colSpan={6}>
                No active groups to assess yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.group_id} className="border-b align-top">
                <td className="py-2 pr-4 font-medium">{row.group_name}</td>
                <td className="py-2 pr-4">
                  {row.attendance_pct === null
                    ? "—"
                    : `${Math.round(row.attendance_pct)}% (${row.attendance_weeks_counted} wk)`}
                  {row.stale ? (
                    <span className="ml-2 text-xs text-amber-700">
                      last saved
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  {row.spiritual_growth_score ?? "—"}
                  {row.spiritual_growth_note ? (
                    <p className="mt-0.5 max-w-[16rem] text-xs text-gray-500">
                      {row.spiritual_growth_note}
                    </p>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  {row.group_question_score ?? "—"}
                  {row.group_question_score !== null &&
                  row.group_question_leader_reported ? (
                    <span className="ml-1 text-xs text-gray-500">
                      (leader-reported)
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  {row.computed_letter ??
                    (row.unassessed ? "Not assessed" : "—")}
                </td>
                <td className="py-2 pr-4">
                  <form
                    action={setGroupHealthRatingsFormAction}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="group_id" value={row.group_id} />
                    <label className="flex flex-col text-xs text-gray-600">
                      <span className="sr-only">{spiritualGrowthLabel}</span>
                      Growth
                      <input
                        type="number"
                        name="spiritual_growth_score"
                        min={1}
                        max={5}
                        defaultValue={row.spiritual_growth_score ?? ""}
                        aria-label={spiritualGrowthLabel}
                        className="w-14 rounded border px-1 py-0.5"
                      />
                    </label>
                    <label className="flex flex-col text-xs text-gray-600">
                      <span className="sr-only">{groupQuestionLabel}</span>
                      Question
                      <input
                        type="number"
                        name="group_question_score"
                        min={1}
                        max={5}
                        defaultValue={row.group_question_score ?? ""}
                        aria-label={groupQuestionLabel}
                        className="w-14 rounded border px-1 py-0.5"
                      />
                    </label>
                    <label className="flex flex-col text-xs text-gray-600">
                      Note
                      <input
                        type="text"
                        name="spiritual_growth_note"
                        defaultValue={row.spiritual_growth_note ?? ""}
                        maxLength={2000}
                        className="w-40 rounded border px-1 py-0.5"
                      />
                    </label>
                    <button
                      type="submit"
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Save
                    </button>
                  </form>
                  <form
                    action={recomputeGroupHealthFormAction}
                    className="mt-1"
                  >
                    <input type="hidden" name="group_id" value={row.group_id} />
                    <button
                      type="submit"
                      className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
                    >
                      Save this month&apos;s grade
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
