import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { FrozenSurfaceBanner } from "@/components/lg/FrozenSurfaceBanner";
import { movedToFor } from "@/lib/nav/route-registry";
import { requireAdmin } from "@/lib/auth/session";
import { loadGroupHealthData } from "@/components/admin/group-health/group-health-data";
import { GroupHealthTriage } from "@/components/lg/admin/group-health-triage";

// Kept off-nav by design — keep/retire/re-export decision: Keep (ADR 0033).
// This standalone triage surface stays reachable by URL: its `grade-actions.ts`
// is the canonical home for the Care rubric-grade write, and it is the target of
// the "Edit rubric" deep-link (lib/nav/return-to.ts).
//
// Deliberately NOT on the adminPage() runner (ADR 0028's "left out" list): the
// header lede and banner placement vary with the degraded-read status, which
// the runner derives from params before the load runs.
//
// One render path for the two degraded-read states (no database vs. failed
// read): same page chrome, only the message and tone differ.
function GroupHealthNotice({
  message,
  tone,
}: {
  message: string;
  tone: "muted" | "rose";
}) {
  return (
    <>
      <FrozenSurfaceBanner
        movedTo={movedToFor("/admin/group-health") ?? undefined}
      />
      <PageHeader eyebrow="Groups" title="Group health" />
      <PageBody>
        <p
          className={`font-sans text-base ${
            tone === "rose" ? "text-rose" : "text-ink2"
          }`}
        >
          {message}
        </p>
      </PageBody>
    </>
  );
}

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
      <GroupHealthNotice
        message="The database isn't configured, so grades can't be loaded."
        tone="muted"
      />
    );
  }

  if (view.status === "error") {
    return (
      <GroupHealthNotice
        message="Couldn't load group-health grades. Refresh to try again."
        tone="rose"
      />
    );
  }

  return (
    <>
      <FrozenSurfaceBanner
        movedTo={movedToFor("/admin/group-health") ?? undefined}
      />
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
          isSuperAdmin={session.profile.role === "super_admin"}
        />
      </PageBody>
    </>
  );
}
