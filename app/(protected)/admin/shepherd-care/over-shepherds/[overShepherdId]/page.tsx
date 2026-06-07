import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { OverShepherdEditForm } from "@/components/admin/shepherd-care/over-shepherd-edit-form";
import { OverShepherdArchiveButton } from "@/components/admin/shepherd-care/over-shepherd-archive-button";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { requireAdmin } from "@/lib/auth/session";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchOverShepherdByIdForAdmin,
  fetchShepherdsCoveredByOverShepherdForAdmin,
  type ShepherdCoveredByOverShepherd,
} from "@/lib/supabase/read-models";
import { isUuid } from "@/lib/shared/uuid";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { OverShepherdsRow } from "@/types/database";

export const dynamic = "force-dynamic";

const cardStyle = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  padding: 20,
};

type DetailResult =
  | {
      kind: "ok";
      overShepherd: OverShepherdsRow;
      coveredShepherds: ShepherdCoveredByOverShepherd[];
      error: string | null;
    }
  | { kind: "not_found" }
  | { kind: "db_unavailable" }
  | { kind: "load_error"; message: string };

async function loadDetail(overShepherdId: string): Promise<DetailResult> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "db_unavailable" };

  const [overShepherdRes, coveredRes] = await Promise.all([
    fetchOverShepherdByIdForAdmin(client, overShepherdId),
    fetchShepherdsCoveredByOverShepherdForAdmin(client, overShepherdId),
  ]);
  // Block the edit form entirely when the over-shepherd record fails to
  // load. Returning a dummy "Unknown" record would let an admin submit
  // the edit form and overwrite the real record with placeholder
  // values; surface the error instead.
  if (overShepherdRes.error) {
    return { kind: "load_error", message: overShepherdRes.error.message };
  }
  if (!overShepherdRes.data) return { kind: "not_found" };

  return {
    kind: "ok",
    overShepherd: overShepherdRes.data,
    coveredShepherds: coveredRes.data ?? [],
    error: coveredRes.error?.message ?? null,
  };
}

export default async function AdminOverShepherdEditPage({
  params,
}: {
  params: Promise<{ overShepherdId: string }>;
}) {
  const session = await requireAdmin();
  const isSuperAdmin = isSuperAdminRole(session.profile.role);

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
  if (detail.kind === "load_error") {
    return (
      <>
        <PageHeader
          eyebrow="Shepherd care"
          title="Over-"
          italic="shepherds"
          lede="We couldn't load this over-shepherd."
        />
        <PageBody>
          <div style={{ display: "grid", gap: 20 }}>
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
              {detail.message}
            </p>
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
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${P.line}`,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink2,
                  margin: 0,
                  maxWidth: 420,
                  lineHeight: 1.45,
                }}
              >
                {detail.overShepherd.active
                  ? "Archiving removes them from the active list but keeps them in history and on past coverage. Restore any time."
                  : "This over-shepherd is archived. Restore to make them selectable for coverage again."}
              </p>
              <OverShepherdArchiveButton
                overShepherdId={detail.overShepherd.id}
                fullName={detail.overShepherd.full_name}
                active={detail.overShepherd.active}
                coveredCount={detail.coveredShepherds.length}
              />
            </div>
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
                  <li
                    key={entry.assignment.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <Link
                      href={`/admin/shepherd-care/${entry.shepherd.id}`}
                      style={{
                        fontFamily: fontBody,
                        color: P.ink,
                        textDecoration: "underline",
                      }}
                    >
                      {entry.shepherd.full_name}
                    </Link>
                    {isSuperAdmin ? (
                      <SuperAdminInlineDelete
                        entityType="shepherd_coverage_assignment"
                        id={entry.assignment.id}
                        label={`coverage of ${entry.shepherd.full_name}`}
                      />
                    ) : null}
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
