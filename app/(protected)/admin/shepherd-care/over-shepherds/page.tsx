import Link from "next/link";
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
} from "@/lib/supabase/read-models";
import { P, fontBody, fontSans } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

const cardStyle = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  padding: 20,
};

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
        eyebrow="Leader care"
        title="Over-"
        italic="shepherds"
        lede="Over-Shepherds Julian tracks. These are admin-only records — they do not log in to the app."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <Link
              href="/admin/shepherd-care"
              style={{
                fontFamily: fontBody,
                color: P.ink2,
                fontSize: 13,
                textDecoration: "underline",
              }}
            >
              ← Back to leader care
            </Link>
          </div>

          {error ? (
            <p
              style={{
                fontFamily: fontBody,
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

          <section style={cardStyle} aria-label="Add over-shepherd">
            <h2
              style={{
                fontFamily: fontSans,
                fontSize: 14,
                letterSpacing: 0.6,
                margin: "0 0 12px",
                color: P.ink,
              }}
            >
              Add over-shepherd
            </h2>
            <OverShepherdCreateForm />
          </section>

          <section style={cardStyle} aria-label="Over-shepherds list">
            <h2
              style={{
                fontFamily: fontSans,
                fontSize: 14,
                letterSpacing: 0.6,
                margin: "0 0 12px",
                color: P.ink,
              }}
            >
              All over-shepherds
            </h2>
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
