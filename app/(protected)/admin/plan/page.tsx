import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { PageSkeleton } from "@/components/lg/PageSkeleton";
import { loadPlanData } from "@/components/admin/plan/plan-data";
import { ProspectBoardView } from "@/components/admin/plan/prospect-board";
import { ProspectCreateForm } from "@/components/admin/plan/prospect-create-form";

// Plan area — the Interest Funnel (ADR 0016, #375). Prospects move
// Interested → Matched → Joined (or parked Not at this time). Matched/Joined
// require a group; Joined collapses into a roll-up off the active board. This
// supersedes the former Guests pipeline, whose frozen /admin/guests route stays
// a direct-URL alias.
export const dynamic = "force-dynamic";

export default async function AdminPlanPage() {
  await requireAdmin();
  // Render the header synchronously and stream the funnel board behind a
  // <Suspense> boundary so a fresh open flushes chrome immediately instead of
  // waiting on the prospect/group reads (see /admin home for the rationale).
  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="The interest"
        italic="funnel"
        lede="Where people interested in joining a group move from first interest to a real group. Matched and Joined need a group; Joined drops off the active board."
      />
      <Suspense fallback={<PageSkeleton bodyOnly />}>
        <PlanData />
      </Suspense>
    </>
  );
}

async function PlanData() {
  // Timed so the production `read_bundle` logs attribute this surface's read
  // latency; `describe` carries only a coarse ok/error discriminant.
  const data = await measureReadBundle(
    "plan_page",
    () => loadPlanData(),
    (d) => ({
      result_kind:
        (d.errors.prospects ?? d.errors.groups ?? d.errors.categoryOptions)
          ? "error"
          : "ok",
    })
  );

  const error =
    data.errors.prospects ?? data.errors.groups ?? data.errors.categoryOptions;

  return (
    <PageBody>
      <div className="grid gap-6">
        <section className="rounded-lg border border-line bg-surface p-card">
          <ProspectCreateForm
            categoryOptionsByAudience={data.categoryOptionsByAudience}
          />
        </section>

        {error ? (
          <p
            role="status"
            className="m-0 rounded-md bg-roseSoft px-3.5 py-2.5 font-sans text-sm text-rose"
          >
            {error}
          </p>
        ) : null}

        <ProspectBoardView
          board={data.board}
          groupNamesById={data.groupNamesById}
          activeGroups={data.activeGroups}
          dueTasks={data.dueTasks}
        />
      </div>
    </PageBody>
  );
}
