import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { requireAdmin } from "@/lib/auth/session";
import { loadGroupHealthData } from "@/components/admin/group-health/group-health-data";
import { GroupHealthTriage } from "@/components/lg/admin/group-health-triage";

// Group health triage workflow (#259, Admin Interaction Model PRD req 2 — the
// Editing Pattern reference implementation). The repeated per-row form-table is
// gone: this is a review/triage table, and editing one group at a time happens
// in the shared EditingSurface drawer (GroupHealthTriage). The grade still
// recomputes live on read for the current month; placeholder labels stay as-is
// (ADR-0007). Data assembly lives behind the reads seam (ADR 0015).
export default async function GroupHealthPage() {
  // Cached guard (the admin layout already ran it); we read it here only to
  // scope the per-user saved filter (#263).
  const session = await requireAdmin();
  const view = await loadGroupHealthData();

  if (view.status === "no-db") {
    return (
      <>
        <PageHeader eyebrow="Groups" title="Group health" />
        <PageBody>
          <p style={{ fontFamily: "var(--font-body)", color: "var(--c-ink2)" }}>
            The database isn&apos;t configured, so grades can&apos;t be loaded.
          </p>
        </PageBody>
      </>
    );
  }

  if (view.status === "error") {
    return (
      <>
        <PageHeader eyebrow="Groups" title="Group health" />
        <PageBody>
          <p style={{ fontFamily: "var(--font-body)", color: "#923220" }}>
            Couldn&apos;t load group-health grades. Refresh to try again.
          </p>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Groups"
        title="Group health"
        lede={`Group-Health Grade for ${view.period}, recomputed live from attendance consistency (rolling 8-week average) and your 1–5 ratings. Open a group to edit its ratings; saving writes the month's snapshot.`}
      />
      <PageBody>
        <GroupHealthTriage
          rows={view.rows}
          period={view.period}
          spiritualGrowthLabel={view.spiritualGrowthLabel}
          groupQuestionLabel={view.groupQuestionLabel}
          watchGrade={view.watchGrade}
          viewerId={session.profile.id}
        />
      </PageBody>
    </>
  );
}
