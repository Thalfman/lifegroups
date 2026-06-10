import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { OverShepherdEditForm } from "@/components/admin/shepherd-care/over-shepherd-edit-form";
import { OverShepherdArchiveButton } from "@/components/admin/shepherd-care/over-shepherd-archive-button";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";
import { requireAdmin } from "@/lib/auth/session";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { loadOverShepherdDetailData } from "@/components/admin/shepherd-care/over-shepherd-detail-data";
import { isUuid } from "@/lib/shared/uuid";

export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-line bg-surface p-card";
const CARD_HEADING = "m-0 mb-3 font-display text-lg font-medium text-ink";
const BACK_LINK = "font-sans text-sm text-ink2 underline hover:text-ink";
const ERROR_BANNER =
  "m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep";

export default async function AdminOverShepherdEditPage({
  params,
}: {
  params: Promise<{ overShepherdId: string }>;
}) {
  const session = await requireAdmin();
  const isSuperAdmin = isSuperAdminRole(session.profile.role);

  const { overShepherdId } = await params;
  if (!isUuid(overShepherdId)) notFound();

  // All reads live behind the reads seam (ADR 0015): the loader binds the live
  // client once and runs the pure buildOverShepherdDetailData assembly, so
  // this page is guard → load → render.
  const detail = await loadOverShepherdDetailData(overShepherdId);
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
            className="text-ink2 underline hover:text-ink"
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
          <div className="grid gap-5">
            <p className={ERROR_BANNER}>{detail.message}</p>
            <Link
              href="/admin/shepherd-care/over-shepherds"
              className={BACK_LINK}
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
        <div className="grid gap-5">
          <div>
            <Link
              href="/admin/shepherd-care/over-shepherds"
              className={BACK_LINK}
            >
              ← Back to over-shepherds
            </Link>
          </div>

          {detail.error ? <p className={ERROR_BANNER}>{detail.error}</p> : null}

          <section className={CARD} aria-label="Edit over-shepherd">
            <h2 className={CARD_HEADING}>Edit over-shepherd</h2>
            <OverShepherdEditForm overShepherd={detail.overShepherd} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
              <p className="m-0 max-w-[420px] font-sans text-sm leading-normal text-ink2">
                {detail.overShepherd.active
                  ? "Archiving removes them from the active list and ends their current coverage, moving those leaders to Unassigned. History is kept; restore any time (coverage is not restored)."
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

          <section className={CARD} aria-label="Currently covers">
            <h2 className={CARD_HEADING}>Currently covers</h2>
            {detail.coveredShepherds.length === 0 ? (
              <p className="m-0 font-sans text-sm text-ink2">
                No active coverage assignments.
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {detail.coveredShepherds.map((entry) => (
                  <li
                    key={entry.assignment.id}
                    className="flex min-h-11 items-center justify-between gap-2.5"
                  >
                    <Link
                      href={`/admin/shepherd-care/${entry.shepherd.id}`}
                      className="font-sans text-base text-ink underline hover:text-ink2"
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
