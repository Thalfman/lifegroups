import Link from "next/link";
import type { OverShepherdListRow } from "@/lib/supabase/read-models";
import { OverShepherdArchiveButton } from "@/components/admin/shepherd-care/over-shepherd-archive-button";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";

const TH =
  "border-b border-line bg-sidebar px-3 py-2.5 text-left font-sans text-xs font-medium text-ink3";
const TD = "border-b border-lineSoft px-3 py-3 align-middle";

export function OverShepherdList({
  overShepherds,
  shepherdCountById,
  isSuperAdmin = false,
}: {
  overShepherds: OverShepherdListRow[];
  shepherdCountById: Map<string, number>;
  // SAD9: super-admin-only inline permanent delete of an over-shepherd record.
  isSuperAdmin?: boolean;
}) {
  if (overShepherds.length === 0) {
    return (
      <div className="px-3 py-8 text-center font-sans text-sm text-ink3">
        No over-shepherds yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-sm border border-line">
      <table className="w-full border-collapse font-sans text-sm text-ink">
        <thead>
          <tr>
            <th className={TH}>Name</th>
            <th className={TH}>Email</th>
            <th className={TH}>Phone</th>
            <th className={TH}>Status</th>
            <th className={TH}>Leaders covered</th>
            <th className={TH}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {overShepherds.map((os) => {
            const count = shepherdCountById.get(os.id) ?? 0;
            return (
              <tr
                key={os.id}
                className="transition-colors duration-150 hover:bg-surfaceAlt"
              >
                <td className={TD}>
                  <Link
                    href={`/admin/shepherd-care/over-shepherds/${os.id}`}
                    className="font-semibold text-ink no-underline hover:underline"
                  >
                    {os.full_name}
                  </Link>
                </td>
                <td className={TD}>
                  {os.email ?? <span className="text-ink3">—</span>}
                </td>
                <td className={TD}>
                  {os.phone ?? <span className="text-ink3">—</span>}
                </td>
                <td className={TD}>
                  {os.active ? (
                    <span className="text-ink">Active</span>
                  ) : (
                    <span className="text-ink3">Archived</span>
                  )}
                </td>
                <td className={TD}>{count}</td>
                <td className={TD}>
                  <div className="inline-flex flex-wrap items-center gap-2">
                    <OverShepherdArchiveButton
                      overShepherdId={os.id}
                      fullName={os.full_name}
                      active={os.active}
                      coveredCount={count}
                    />
                    {isSuperAdmin ? (
                      <SuperAdminInlineDelete
                        entityType="over_shepherd"
                        id={os.id}
                        label={os.full_name}
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
