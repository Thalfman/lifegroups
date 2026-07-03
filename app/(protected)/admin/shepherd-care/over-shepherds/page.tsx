import Link from "next/link";
import {
  cardClassName as CARD,
  cardHeadingClassName as CARD_HEADING,
} from "@/components/lg/Card";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { OverShepherdCreateForm } from "@/components/admin/shepherd-care/over-shepherd-create-form";
import { OverShepherdList } from "@/components/admin/shepherd-care/over-shepherd-list";
import { requireAdmin } from "@/lib/auth/session";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchOverShepherdsForAdmin,
  type ActiveShepherdCoverageAssignmentSummary,
  type OverShepherdListRow,
} from "@/lib/supabase/shepherd-coverage-reads";

export const dynamic = "force-dynamic";

async function loadOverShepherds(): Promise<{
  overShepherds: OverShepherdListRow[];
  assignments: ActiveShepherdCoverageAssignmentSummary[];
  error: string | null;
}> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      overShepherds: [],
      assignments: [],
      error: "Database is not configured in this environment.",
    };
  }
  const [overShepherdsRes, assignmentsRes] = await Promise.all([
    fetchOverShepherdsForAdmin(client, { includeArchived: true }),
    fetchActiveShepherdCoverageAssignmentsForAdmin(client),
  ]);
  return {
    overShepherds: overShepherdsRes.data ?? [],
    assignments: assignmentsRes.data ?? [],
    error:
      overShepherdsRes.error?.message ?? assignmentsRes.error?.message ?? null,
  };
}

export default async function AdminOverShepherdsPage() {
  const session = await requireAdmin();
  const isSuperAdmin = isSuperAdminRole(session.profile.role);

  const { overShepherds, assignments, error } = await loadOverShepherds();
  const shepherdCountById = new Map<string, number>();
  for (const a of assignments) {
    shepherdCountById.set(
      a.over_shepherd_id,
      (shepherdCountById.get(a.over_shepherd_id) ?? 0) + 1
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Shepherd care"
        title="Over-"
        italic="shepherds"
        lede="Over-Shepherds Julian tracks. These are admin-only records — they do not log in to the app."
      />
      <PageBody>
        <div className="grid gap-5">
          <div>
            <Link
              href="/admin/shepherd-care"
              className="font-sans text-sm text-ink2 underline hover:text-ink"
            >
              ← Back to shepherd care
            </Link>
          </div>

          {error ? (
            <p className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep">
              {error}
            </p>
          ) : null}

          <section className={CARD} aria-label="Add over-shepherd">
            <h2 className={CARD_HEADING}>Add over-shepherd</h2>
            <OverShepherdCreateForm />
          </section>

          <section className={CARD} aria-label="Over-shepherds list">
            <h2 className={CARD_HEADING}>All over-shepherds</h2>
            <OverShepherdList
              overShepherds={overShepherds}
              shepherdCountById={shepherdCountById}
              isSuperAdmin={isSuperAdmin}
            />
          </section>
        </div>
      </PageBody>
    </>
  );
}
