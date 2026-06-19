import { measureReadBundle } from "@/lib/observability/read-timing";
import { PageBody } from "@/components/lg/PageHeader";
import { PageSkeleton } from "@/components/lg/PageSkeleton";
import { adminPage } from "@/lib/admin/admin-page";
import { loadPlanData } from "@/components/admin/plan/plan-data";
import { ProspectBoardView } from "@/components/admin/plan/prospect-board";
import { ProspectCreateForm } from "@/components/admin/plan/prospect-create-form";

// Plan area — the Interest Funnel (ADR 0016, #375). Prospects move
// Interested → Matched → Joined (or parked Not at this time). Matched/Joined
// require a group; Joined collapses into a roll-up off the active board. This
// supersedes the former Guests pipeline, whose frozen /admin/guests route stays
// a direct-URL alias.
//
// Wired through the admin page runner (ADR 0028): the header streams above the
// funnel board behind <Suspense> (the `fallback`) so a fresh open flushes
// chrome immediately instead of waiting on the prospect/group reads.
export const dynamic = "force-dynamic";

export default adminPage({
  // Timed so the production `read_bundle` logs attribute this surface's read
  // latency; `describe` carries only a coarse ok/error discriminant.
  load: () =>
    measureReadBundle("plan_page", loadPlanData, (d) => ({
      result_kind:
        (d.errors.prospects ?? d.errors.groups ?? d.errors.categoryOptions)
          ? "error"
          : "ok",
    })),
  header: () => ({
    eyebrow: "Plan",
    title: "The interest",
    italic: "funnel",
    lede: "Where people interested in joining a group move from first interest to a real group. Matched and Joined need a group; Joined drops off the active board.",
  }),
  fallback: <PageSkeleton bodyOnly />,
  render: (data) => {
    const error =
      data.errors.prospects ??
      data.errors.groups ??
      data.errors.categoryOptions;
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
  },
});
