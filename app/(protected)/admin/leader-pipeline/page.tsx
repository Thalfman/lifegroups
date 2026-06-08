import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { loadLeaderPipelineData } from "@/components/admin/leader-pipeline/leader-pipeline-data";
import { LeaderPipeline } from "@/components/admin/leader-pipeline/leader-pipeline";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

export default async function AdminLeaderPipelinePage() {
  await requireAdmin();
  const data = await loadLeaderPipelineData();

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Leader"
        italic="pipeline"
        lede="Every apprentice and where they stand — Identified, In training, Ready to lead, Launched. The supply side of multiplication: who's ready to lead the next group, and which groups have no apprentice yet."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 24 }}>
          {data.error ? (
            <p
              style={{
                margin: 0,
                fontFamily: fontBody,
                fontSize: 13,
                color: "#7d3621",
                background: P.terraSoft,
                border: `1px solid ${P.terra}`,
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              The leader pipeline could not be loaded: {data.error}
            </p>
          ) : (
            <LeaderPipeline
              rollup={data.rollup}
              availableGroups={data.availableGroups}
            />
          )}
        </div>
      </PageBody>
    </>
  );
}
