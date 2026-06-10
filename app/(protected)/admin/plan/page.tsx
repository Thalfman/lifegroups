import { requireAdmin } from "@/lib/auth/session";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
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
  const data = await loadPlanData();

  const error =
    data.errors.prospects ?? data.errors.groups ?? data.errors.categoryOptions;

  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="The interest"
        italic="funnel"
        lede="Where people interested in joining a group move from first interest to a real group. Matched and Joined need a group; Joined drops off the active board."
      />
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
    </>
  );
}
