import { requireAdmin } from "@/lib/auth/session";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { loadPlanData } from "@/components/admin/plan/plan-data";
import { ProspectBoardView } from "@/components/admin/plan/prospect-board";
import { ProspectCreateForm } from "@/components/admin/plan/prospect-create-form";
import { P, fontBody } from "@/lib/pastoral";

// Plan area — the Interest Funnel (ADR 0016, #375). Prospects move
// Interested → Matched → Joined (or parked Not at this time). Matched/Joined
// require a group; Joined collapses into a roll-up off the active board. This
// supersedes the former Guests pipeline, whose frozen /admin/guests route stays
// a direct-URL alias.
export const dynamic = "force-dynamic";

export default async function AdminPlanPage() {
  await requireAdmin();
  const data = await loadPlanData();

  const error = data.errors.prospects ?? data.errors.groups;

  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="The interest"
        italic="funnel"
        lede="Where people interested in joining a group move from first interest to a real group. Matched and Joined need a group; Joined rolls up off the board."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 24 }}>
          <section
            style={{
              border: `1px solid ${P.line}`,
              borderRadius: 12,
              background: P.surface,
              padding: "20px 22px",
            }}
          >
            <ProspectCreateForm />
          </section>

          {error ? (
            <p
              role="status"
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: "#923220",
                background: P.terraSoft,
                padding: "10px 14px",
                borderRadius: 8,
                margin: 0,
              }}
            >
              {error}
            </p>
          ) : null}

          <ProspectBoardView
            board={data.board}
            groupNamesById={data.groupNamesById}
            activeGroups={data.activeGroups}
          />
        </div>
      </PageBody>
    </>
  );
}
