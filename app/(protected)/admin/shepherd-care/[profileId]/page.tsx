// Shepherd-care person detail: guard + spine load + hand-off. The tabbed body
// (all panel markup, incl. the #377/#378 grade-read refusals and the SC.4
// private-note gating) lives in
// components/admin/shepherd-care/shepherd-care-detail-view.tsx (#822).

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { DetailTabPanelSkeleton } from "@/components/lg/DetailPageSkeleton";
import { ShepherdCareDetailBody } from "@/components/admin/shepherd-care/shepherd-care-detail-view";
import { requireAdmin } from "@/lib/auth/session";
import { loadShepherdCareDetailSpine } from "@/components/admin/shepherd-care/shepherd-care-detail-data";
import { currentMinistryYear } from "@/lib/admin/ministry-year";
import { isUuid } from "@/lib/shared/uuid";
import { firstParam } from "@/lib/shared/search-params";

export const dynamic = "force-dynamic";

export default async function AdminShepherdCareDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ profileId: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const session = await requireAdmin();
  // requireAdmin redirects every non-authenticated case, so this is always the
  // authenticated branch; narrow for the creator id used to scope private notes.
  const creatorProfileId =
    session.kind === "authenticated" ? session.profile.id : null;
  if (!creatorProfileId) notFound();
  // SC.4 private notes are ministry_admin-only. requireAdmin also admits
  // super_admin, so gate the section explicitly: no super-admin component path.
  const actorRole =
    session.kind === "authenticated" ? session.profile.role : null;

  const { profileId } = await params;
  if (!isUuid(profileId)) notFound();

  // Current Ministry Year, shared by the Leader-Health Grade (#378) and the
  // per-group Group-Health Grade (#377) reads. Off-season (Jun/Jul) has no
  // ministry year, so the grade controls are suppressed then.
  const ministryYear = currentMinistryYear();

  // Resolve only the spine synchronously (one profile read): it titles the
  // header and decides 404, so it must complete before anything renders. The
  // heavy body bundle (care profile, interactions, rubric grades, the grant-
  // gated Care Notes ladder, and the ministry_admin-only Private Care Note) is
  // deferred into the Suspense boundary below and streams in after the header +
  // back link paint (repo-sweep #605).
  const spine = await loadShepherdCareDetailSpine(profileId);
  if (spine.kind === "db_unavailable") {
    return (
      <>
        <PageHeader
          eyebrow="Care"
          title="Shepherd"
          italic="care"
          lede="Database is not configured in this environment."
        />
        <PageBody>
          <Link
            href="/admin/shepherd-care"
            className="text-ink2 underline hover:text-ink"
          >
            Back to directory
          </Link>
        </PageBody>
      </>
    );
  }
  if (spine.kind === "not_found") notFound();

  const tabRaw = (await searchParams)?.tab;
  const tabParam = firstParam(tabRaw);

  return (
    <>
      <PageHeader
        eyebrow="Care"
        title={spine.spine.profileFullName}
        lede="Care notes here are admin-only. They never appear on shepherd or member surfaces."
      />
      <PageBody>
        <div className="grid gap-5">
          <div>
            <Link
              href="/admin/care"
              className="font-sans text-sm text-ink2 underline hover:text-ink"
            >
              ← Back to Care
            </Link>
          </div>
          <Suspense key={profileId} fallback={<DetailTabPanelSkeleton />}>
            <ShepherdCareDetailBody
              profileId={profileId}
              creatorProfileId={creatorProfileId}
              actorRole={actorRole}
              ministryYear={ministryYear}
              tabParam={tabParam}
            />
          </Suspense>
        </div>
      </PageBody>
    </>
  );
}
