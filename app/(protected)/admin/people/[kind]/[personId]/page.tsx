import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { DetailTabPanelSkeleton } from "@/components/lg/DetailPageSkeleton";
import { PersonDetailShell } from "@/components/admin/person-detail/person-detail-shell";
import { PersonDetailHeaderActions } from "@/components/admin/person-detail/person-detail-header-actions";
import {
  loadPersonSpine,
  loadPersonBody,
  type PersonSpine,
} from "@/components/admin/person-detail/person-detail-data";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Params = { kind: string; personId: string };

export default async function AdminPersonDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const session = await requireAdmin();
  const { kind, personId } = await params;
  if (kind !== "profile" && kind !== "member") notFound();

  // Resolve only the spine synchronously: it titles the header and decides 404,
  // so it must complete before anything renders. The heavy body reads (group
  // placements + the active-leader care-cadence flag) are deferred into the
  // Suspense boundary below and stream in after the header + back link paint
  // (repo-sweep #605).
  const spine = await loadPersonSpine(kind, personId);

  if (spine.kind === "db_unavailable") {
    return (
      <>
        <PageHeader eyebrow="People" title="Person" italic="detail" />
        <PageBody>
          <p className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep">
            The database is not configured in this environment.
          </p>
        </PageBody>
      </>
    );
  }

  if (spine.kind === "not_found") notFound();
  const { spine: person } = spine;

  return (
    <>
      <PageHeader
        eyebrow="People"
        title={person.fullName}
        italic={person.roleLabel.toLowerCase()}
        lede="One person, end to end — overview, group, care, activity, and access."
      />
      <PageBody>
        <div className="grid gap-[18px]">
          {/* Back link on the left, the registry-driven action menu on the
              right (#781 OPP-6): Change role / Archive now live on the person's
              own detail header, mirroring the group detail header, so acting on
              someone no longer means returning to the People directory row. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/admin/people"
              className="font-sans text-sm text-ink2 underline hover:text-ink"
            >
              ← Back to People
            </Link>
            <PersonDetailHeaderActions
              person={{
                kind: person.kind,
                id: person.id,
                fullName: person.fullName,
                status: person.status,
                leaderRole: person.leaderRole,
              }}
              viewerRole={session.profile.role}
              // Suppress self-target lifecycle actions on the admin's own
              // profile (the people RPCs reject a self-target).
              isSelf={
                person.kind === "profile" && person.id === session.profile.id
              }
            />
          </div>
          <Suspense
            key={`${person.kind}-${person.id}`}
            fallback={<DetailTabPanelSkeleton />}
          >
            <PersonBodyPanel spine={person} />
          </Suspense>
        </div>
      </PageBody>
    </>
  );
}

// The streamed body: runs the deferred reads against the already-resolved spine
// behind the route's Suspense boundary, so the header + back link paint first.
// PersonDetailShell's props are unchanged — the spine/body split is internal to
// the loader, so the client contract is preserved.
async function PersonBodyPanel({ spine }: { spine: PersonSpine }) {
  const { person, availableGroups } = await loadPersonBody(spine);
  return (
    <PersonDetailShell person={person} availableGroups={availableGroups} />
  );
}
