import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { OverShepherdEditForm } from "@/components/admin/shepherd-care/over-shepherd-edit-form";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchActiveShepherdCoverageAssignmentsForAdmin,
  fetchOverShepherdByIdForAdmin,
  type ActiveShepherdCoverageAssignmentSummary,
} from "@/lib/supabase/read-models";
import { isUuid } from "@/lib/shared/uuid";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { OverShepherdsRow, ProfilesRow } from "@/types/database";

export const dynamic = "force-dynamic";

const cardStyle = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  padding: 20,
};

async function loadDetail(overShepherdId: string): Promise<
  | {
      kind: "ok";
      overShepherd: OverShepherdsRow;
      coveredShepherds: Array<{
        profile: Pick<ProfilesRow, "id" | "full_name">;
        assignment: ActiveShepherdCoverageAssignmentSummary;
      }>;
      error: string | null;
    }
  | { kind: "not_found" }
  | { kind: "db_unavailable" }
> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "db_unavailable" };

  const [overShepherdRes, assignmentsRes] = await Promise.all([
    fetchOverShepherdByIdForAdmin(client, overShepherdId),
    fetchActiveShepherdCoverageAssignmentsForAdmin(client),
  ]);
  if (overShepherdRes.error) {
    return {
      kind: "ok",
      overShepherd: {
        id: overShepherdId,
        full_name: "Unknown",
        email: null,
        phone: null,
        active: false,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        archived_at: null,
      },
      coveredShepherds: [],
      error: overShepherdRes.error.message,
    };
  }
  if (!overShepherdRes.data) return { kind: "not_found" };

  const myAssignments = (assignmentsRes.data ?? []).filter(
    (a) => a.over_shepherd_id === overShepherdId,
  );

  let coveredShepherds: Array<{
    profile: Pick<ProfilesRow, "id" | "full_name">;
    assignment: ActiveShepherdCoverageAssignmentSummary;
  }> = [];
  if (myAssignments.length > 0) {
    const shepherdIds = myAssignments.map((a) => a.shepherd_profile_id);
    const { data, error } = await client
      .from("profiles")
      .select("id, full_name")
      .in("id", shepherdIds);
    if (error) {
      return {
        kind: "ok",
        overShepherd: overShepherdRes.data,
        coveredShepherds: [],
        error: error.message,
      };
    }
    const byId = new Map<string, Pick<ProfilesRow, "id" | "full_name">>();
    for (const p of (data ?? []) as Pick<ProfilesRow, "id" | "full_name">[]) {
      byId.set(p.id, p);
    }
    coveredShepherds = myAssignments
      .map((a) => {
        const profile = byId.get(a.shepherd_profile_id);
        if (!profile) return null;
        return { profile, assignment: a };
      })
      .filter(
        (
          entry,
        ): entry is {
          profile: Pick<ProfilesRow, "id" | "full_name">;
          assignment: ActiveShepherdCoverageAssignmentSummary;
        } => entry !== null,
      )
      .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name));
  }

  return {
    kind: "ok",
    overShepherd: overShepherdRes.data,
    coveredShepherds,
    error: assignmentsRes.error?.message ?? null,
  };
}

export default async function AdminOverShepherdEditPage({
  params,
}: {
  params: Promise<{ overShepherdId: string }>;
}) {
  await requireAdmin();

  const { overShepherdId } = await params;
  if (!isUuid(overShepherdId)) notFound();

  const detail = await loadDetail(overShepherdId);
  if (detail.kind === "not_found") notFound();
  if (detail.kind === "db_unavailable") {
    return (
      <>
        <PageHeader
          eyebrow="Shepherd care"
          title="Over-"
          italic="shepherds"
          lede="Database is not configured in this environment."
        />
        <PageBody>
          <Link
            href="/admin/shepherd-care/over-shepherds"
            style={{ color: P.ink2, textDecoration: "underline" }}
          >
            Back to over-shepherds
          </Link>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Shepherd care"
        title={detail.overShepherd.full_name}
        lede="Admin-only over-shepherd record. These details never appear on leader or member surfaces."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <Link
              href="/admin/shepherd-care/over-shepherds"
              style={{
                fontFamily: fontBody,
                color: P.ink2,
                fontSize: 13,
                textDecoration: "underline",
              }}
            >
              ← Back to over-shepherds
            </Link>
          </div>

          {detail.error ? (
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
              {detail.error}
            </p>
          ) : null}

          <section style={cardStyle} aria-label="Edit over-shepherd">
            <h2
              style={{
                fontFamily: fontSans,
                fontSize: 14,
                letterSpacing: 0.6,
                margin: "0 0 12px",
                color: P.ink,
              }}
            >
              Edit over-shepherd
            </h2>
            <OverShepherdEditForm overShepherd={detail.overShepherd} />
          </section>

          <section style={cardStyle} aria-label="Currently covers">
            <h2
              style={{
                fontFamily: fontSans,
                fontSize: 14,
                letterSpacing: 0.6,
                margin: "0 0 12px",
                color: P.ink,
              }}
            >
              Currently covers
            </h2>
            {detail.coveredShepherds.length === 0 ? (
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink2,
                  margin: 0,
                }}
              >
                No active coverage assignments.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "grid",
                  gap: 6,
                }}
              >
                {detail.coveredShepherds.map((entry) => (
                  <li key={entry.assignment.id}>
                    <Link
                      href={`/admin/shepherd-care/${entry.profile.id}`}
                      style={{
                        fontFamily: fontBody,
                        color: P.ink,
                        textDecoration: "underline",
                      }}
                    >
                      {entry.profile.full_name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PageBody>
    </>
  );
}
