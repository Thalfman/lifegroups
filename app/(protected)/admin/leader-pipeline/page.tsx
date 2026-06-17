import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { FrozenSurfaceBanner } from "@/components/lg/FrozenSurfaceBanner";
import { requireAdmin } from "@/lib/auth/session";
import { loadLeaderPipelineData } from "@/components/admin/leader-pipeline/leader-pipeline-data";
import { LeaderPipeline } from "@/components/admin/leader-pipeline/leader-pipeline";

export const dynamic = "force-dynamic";

export default async function AdminLeaderPipelinePage() {
  await requireAdmin();
  const data = await loadLeaderPipelineData();

  return (
    <>
      <FrozenSurfaceBanner />
      <PageHeader
        eyebrow="People"
        title="Leader"
        italic="pipeline"
        lede="Every apprentice and where they stand — Identified, In training, Ready to lead, Launched. The supply side of multiplication: who's ready to lead the next group, and which groups have no apprentice yet."
      />
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
    </>
  );
}
