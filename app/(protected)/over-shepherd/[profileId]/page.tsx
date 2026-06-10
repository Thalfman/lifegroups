import { notFound } from "next/navigation";
import Link from "next/link";
import { LgAppShell } from "@/components/lg/shell/LgAppShell";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { EmptyState } from "@/components/dashboard/cards";
import { InteractionTimeline } from "@/components/admin/shepherd-care/interaction-timeline";
import { ShepherdCareStatusBadge } from "@/components/admin/shepherd-care/status-badge";
import { LogBroadNoteForm } from "@/components/over-shepherd/log-broad-note-form";
import { CareNoteWriteForm } from "@/components/admin/shepherd-care/care-note-write-form";
import { MyCareNotes } from "@/components/over-shepherd/my-care-notes";
import { requireOverShepherd } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchOverShepherdCoverageForCaller,
  isCoveredShepherd,
} from "@/lib/over-shepherd/coverage";
import {
  fetchOverShepherdCareInteractions,
  fetchOverShepherdCareProfileByShepherdId,
} from "@/lib/over-shepherd/read-models";
import {
  fetchCareNotesForSubject,
  fetchPrayerRequestsForSubject,
} from "@/lib/supabase/read-models";
import type {
  CareNotesRow,
  PrayerRequestsRow,
  ShepherdCareInteractionsRow,
} from "@/types/database";
import { isUuid } from "@/lib/shared/uuid";
import { formatIsoDateOr } from "@/lib/shared/date";

export const dynamic = "force-dynamic";

// Card anatomy per docs/design-direction.md §4: border, no shadow.
const CARD = "rounded-lg border border-line bg-surface p-card";

// Per-Shepherd care history for the Over-Shepherd surface — read-only, scoped
// to a Shepherd the caller actively covers
// (docs/adr/0002-oversight-ladder-and-leader-gating.md). Defense-in-depth:
// an uncovered (or non-uuid) profileId 404s before any care row is read, on
// top of the coverage-scoped RLS. admin_summary is never read here.
export default async function OverShepherdShepherdPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const session = await requireOverShepherd();
  const { profileId } = await params;
  if (!isUuid(profileId)) notFound();

  const client = await createSupabaseServerClient();

  const coverageResult = await fetchOverShepherdCoverageForCaller(client);
  // Treat a backend failure as not-found rather than leaking a 500 or, worse,
  // rendering a Shepherd we can't confirm is covered.
  if (coverageResult.error) notFound();
  if (!isCoveredShepherd(coverageResult.data, profileId)) notFound();

  const user = {
    name: session.profile.full_name,
    email: session.profile.email,
    role: session.profile.role,
  };

  // The name read and the care-profile read are both keyed only on profileId
  // and independent, so issue them in parallel. Only the interaction history
  // below genuinely depends on the resolved care row. (RLS scopes both reads to
  // covered profiles.)
  const [profileQuery, careResult, careNotesResult, prayerRequestsResult] =
    await Promise.all([
      client!
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", profileId)
        .maybeSingle(),
      fetchOverShepherdCareProfileByShepherdId(client!, profileId),
      // The caller's OWN author-private notes/prayers about this Leader, read
      // back so they can verify what they saved. RLS returns the author's rows
      // regardless of the transparency toggle.
      fetchCareNotesForSubject(client!, profileId),
      fetchPrayerRequestsForSubject(client!, profileId),
    ]);
  const myCareNotes: CareNotesRow[] = careNotesResult.data ?? [];
  const myPrayerRequests: PrayerRequestsRow[] = prayerRequestsResult.data ?? [];
  const shepherdName =
    (profileQuery.data as { full_name?: string } | null)?.full_name ??
    "This Leader";

  let interactions: ShepherdCareInteractionsRow[] = [];
  if (careResult.data) {
    const inter = await fetchOverShepherdCareInteractions(
      client!,
      careResult.data.id
    );
    if (!inter.error) interactions = inter.data;
  }

  const care = careResult.data;

  return (
    <LgAppShell user={user}>
      <PageHeader
        eyebrow="Care history"
        title={shepherdName}
        maxWidth={820}
        actions={
          <Link
            href="/over-shepherd"
            className="font-sans text-sm text-ink2 underline hover:text-ink"
          >
            ← My Leaders
          </Link>
        }
      />
      <PageBody maxWidth={820}>
        <div className="grid gap-5">
          <section className="flex flex-wrap items-center gap-3 font-sans text-base text-ink">
            <span>Current status:</span>
            {care ? (
              <ShepherdCareStatusBadge status={care.current_status} />
            ) : (
              <span className="text-ink3">No care record yet</span>
            )}
            <span className="text-ink3">
              Last contact:{" "}
              {care?.last_contact_at
                ? formatIsoDateOr(care.last_contact_at, "—")
                : "Never"}
            </span>
          </section>

          <section className={CARD}>
            <LogBroadNoteForm shepherdProfileId={profileId} />
          </section>

          {/* Pivot slice 9 (#381 / ADR 0017): author-private Care Notes +
              Prayer Requests about this covered Leader. Private to you by
              default; ministry leadership reads them only when this Leader's
              transparency toggle is on (controlled in admin Care). */}
          <section className={`${CARD} grid gap-5`}>
            <CareNoteWriteForm subjectProfileId={profileId} kind="care_note" />
            <CareNoteWriteForm
              subjectProfileId={profileId}
              kind="prayer_request"
            />
            <MyCareNotes
              careNotes={myCareNotes}
              prayerRequests={myPrayerRequests}
            />
          </section>

          {interactions.length === 0 ? (
            <EmptyState
              title="No care interactions logged yet"
              description="Care touches with this Leader will appear here."
            />
          ) : (
            <InteractionTimeline interactions={interactions} />
          )}
        </div>
      </PageBody>
    </LgAppShell>
  );
}
