import { PageBody } from "@/components/lg/PageHeader";
import { adminPage } from "@/lib/admin/admin-page";
import { loadLeaderPipelineData } from "@/components/admin/leader-pipeline/leader-pipeline-data";
import { LeaderPipeline } from "@/components/admin/leader-pipeline/leader-pipeline";

// Wired through the admin page runner (ADR 0028); the frozen-surface banner is
// the runner's `frozenBanner`.
export const dynamic = "force-dynamic";

export default adminPage({
  frozenBanner: true,
  load: () => loadLeaderPipelineData(),
  header: () => ({
    eyebrow: "People",
    title: "Shepherd",
    italic: "pipeline",
    lede: "Every apprentice and where they stand — Identified, In training, Ready to lead, Launched. The supply side of multiplication: who's ready to lead the next group, and which groups have no apprentice yet.",
  }),
  render: (data) => (
    <PageBody>
      <div style={{ display: "grid", gap: 24 }}>
        {data.error ? (
          <p className="m-0 rounded-md bg-roseSoft px-3.5 py-2.5 font-sans text-sm text-rose">
            The leader pipeline could not be loaded: {data.error}
          </p>
        ) : (
          <LeaderPipeline
            rollup={data.rollup}
            availableGroups={data.availableGroups}
            memberOptionsByGroup={data.memberOptionsByGroup}
          />
        )}
      </div>
    </PageBody>
  ),
});
