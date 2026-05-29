import { notFound } from "next/navigation";
import Link from "next/link";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { EmptyState } from "@/components/dashboard/cards";
import { InteractionTimeline } from "@/components/admin/shepherd-care/interaction-timeline";
import { ShepherdCareStatusBadge } from "@/components/admin/shepherd-care/status-badge";
import { requireOverShepherd } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchOverShepherdCoverageForCaller,
  isCoveredShepherd,
} from "@/lib/over-shepherd/coverage";
import {
  fetchOverShepherdCareInteractions,
  fetchOverShepherdCareProfileByShepherdId,
} from "@/lib/over-shepherd/read-models";
import type { ShepherdCareInteractionsRow } from "@/types/database";
import { isUuid } from "@/lib/shared/uuid";
import { formatIsoDateOr } from "@/lib/shared/date";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

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

  const navItems = navItemsForRole(session.profile.role);
  const currentUser = {
    name: session.profile.full_name,
    email: session.profile.email,
    role: session.profile.role,
  };

  // The name read and the care-profile read are both keyed only on profileId
  // and independent, so issue them in parallel. Only the interaction history
  // below genuinely depends on the resolved care row. (RLS scopes both reads to
  // covered profiles.)
  const [profileQuery, careResult] = await Promise.all([
    client!
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", profileId)
      .maybeSingle(),
    fetchOverShepherdCareProfileByShepherdId(client!, profileId),
  ]);
  const shepherdName =
    (profileQuery.data as { full_name?: string } | null)?.full_name ??
    "This Shepherd";

  let interactions: ShepherdCareInteractionsRow[] = [];
  if (careResult.data) {
    const inter = await fetchOverShepherdCareInteractions(
      client!,
      careResult.data.id,
    );
    if (!inter.error) interactions = inter.data;
  }

  const care = careResult.data;

  return (
    <PastoralAppShell
      navItems={navItems}
      currentUser={currentUser}
      eyebrow="Care history"
      title={shepherdName}
      contentMaxWidth={820}
      headerSlot={
        <div style={{ marginTop: 6 }}>
          <Link
            href="/over-shepherd"
            style={{ color: P.ink3, fontFamily: fontBody, fontSize: 13 }}
          >
            ← My Shepherds
          </Link>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 18 }}>
        <section
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            fontFamily: fontBody,
            color: P.ink,
          }}
        >
          <span>Current status:</span>
          {care ? (
            <ShepherdCareStatusBadge status={care.current_status} />
          ) : (
            <span style={{ color: P.ink3 }}>No care record yet</span>
          )}
          <span style={{ color: P.ink3 }}>
            Last contact:{" "}
            {care?.last_contact_at ? formatIsoDateOr(care.last_contact_at, "—") : "Never"}
          </span>
        </section>

        {interactions.length === 0 ? (
          <EmptyState
            title="No care interactions logged yet"
            description="Care touches with this Shepherd will appear here."
          />
        ) : (
          <InteractionTimeline interactions={interactions} />
        )}
      </div>
    </PastoralAppShell>
  );
}
