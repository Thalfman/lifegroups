import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { CoverageAssignmentForm } from "@/components/admin/shepherd-care/coverage-assignment-form";
import { CareActions } from "@/components/admin/shepherd-care/care-actions";
import { CareFollowUpsSection } from "@/components/admin/shepherd-care/care-follow-ups-section";
import { InteractionTimeline } from "@/components/admin/shepherd-care/interaction-timeline";
import { PrivateNotesSection } from "@/components/admin/shepherd-care/private-notes-section";
import {
  CareNotesSection,
  type AuthoredGroupNote,
} from "@/components/admin/shepherd-care/care-notes-section";
import { ShepherdCareStatusBadge } from "@/components/admin/shepherd-care/status-badge";
import { AttentionResetEntityButton } from "@/components/admin/attention-reset-entity-button";
import { LeaderDetailTabs } from "@/components/admin/shepherd-care/leader-detail-tabs";
import { GroupRubricGradeEntry } from "@/components/admin/care/group-rubric-grade-entry";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
import { decodeRubricCriteria } from "@/lib/admin/health-rubric";
import {
  getGroupRubricGrade,
  type GroupRubricGradeView,
} from "@/lib/admin/group-rubric-grade-read";
import {
  currentMinistryYear,
  currentPeriodMonthIso,
} from "@/lib/admin/ministry-year";
import {
  currentUtcDateIso,
  fetchActiveShepherdCoverageAssignmentByShepherdId,
  fetchAdminShepherdProfileById,
  fetchGenericFollowUpCountForAssignee,
  fetchLedGroupSummariesForProfile,
  fetchOverShepherdsForAdmin,
  fetchPrivateNoteKeySlotsForCreator,
  fetchShepherdCareFollowUpsForProfile,
  fetchShepherdCareInteractionsForAdmin,
  fetchShepherdCarePrivateNoteCiphertextForCreator,
  fetchShepherdCareProfileByShepherdId,
  fetchCareNotesForSubject,
  fetchPrayerRequestsForSubject,
  fetchAuthoredGroupCareNotes,
  fetchAuthoredGroupPrayerRequests,
  fetchGroupsByIds,
  fetchNoteTransparencyGrant,
  type ActiveShepherdCoverageAssignmentSummary,
  type LedGroupSummary,
  type OverShepherdListRow,
  type PrivateNoteCiphertext,
  type PrivateNoteKeySlot,
} from "@/lib/supabase/read-models";
import { formatIsoDateOr } from "@/lib/shared/date";
import { isUuid } from "@/lib/shared/uuid";
import { LeaderHealthGradeEditor } from "@/components/admin/shepherd-care/leader-health-grade";
import {
  fetchLeaderHealthRubric,
  fetchLeaderRubricGrade,
  type LeaderRubricGradeRow,
} from "@/lib/admin/leader-health-read";
import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";
import { type RubricCriterion } from "@/lib/admin/health-rubric";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type {
  CareNotesRow,
  PrayerRequestsRow,
  ShepherdCareFollowUpsRow,
  ShepherdCareInteractionsRow,
  ShepherdCareProfilesRow,
} from "@/types/database";

export const dynamic = "force-dynamic";

const labelStyle = {
  display: "block",
  fontFamily: fontSans,
  fontSize: 10,
  letterSpacing: 1.6,
  textTransform: "uppercase" as const,
  color: P.ink3,
  fontWeight: 600,
  marginBottom: 4,
};

const valueStyle = {
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
};

const cardStyle = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  padding: 20,
};

// Shown in place of a grade editor when its read failed — blocks editing so a
// blank seed can't overwrite an existing grade (#377/#378 read-failure guard).
const gradeReadErrorStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.terraTextStrong,
  margin: 0,
  lineHeight: 1.5,
};

async function loadDetail(
  profileId: string,
  creatorProfileId: string,
  // SC.4: only a ministry_admin may read private notes. requireAdmin() also
  // admits super_admin, so gate the reader CALLS here — never invoke the
  // private-note readers on a super_admin request (no read path, not just no UI).
  canReadPrivateNotes: boolean
): Promise<
  | {
      kind: "ok";
      profileFullName: string;
      profileRole: string;
      care: ShepherdCareProfilesRow | null;
      interactions: ShepherdCareInteractionsRow[];
      followUps: ShepherdCareFollowUpsRow[];
      genericFollowUpCount: number;
      ledGroups: LedGroupSummary[];
      activeOverShepherds: OverShepherdListRow[];
      coverage: ActiveShepherdCoverageAssignmentSummary | null;
      privateNote: PrivateNoteCiphertext | null;
      privateNoteKeySlots: PrivateNoteKeySlot[];
      error: string | null;
    }
  | { kind: "not_found" }
  | { kind: "db_unavailable" }
> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "db_unavailable" };

  // Fire the profile lookup together with the five reads that depend only on
  // profileId (or the calling admin) — none of them need the profile row, so
  // gating them behind the profile fetch only added a round-trip on the common
  // valid-profile path. Validation still runs first against the resolved
  // profile below; on an invalid id the extra reads are harmless RLS-scoped
  // results that are simply discarded. Private-note key slots are per-creator
  // (not per care profile), so they load here too.
  const [
    profile,
    careResult,
    overShepherdsRes,
    coverageRes,
    genericCountRes,
    ledGroupsRes,
    keySlotsRes,
  ] = await Promise.all([
    fetchAdminShepherdProfileById(client, profileId),
    fetchShepherdCareProfileByShepherdId(client, profileId),
    fetchOverShepherdsForAdmin(client, { includeArchived: false }),
    fetchActiveShepherdCoverageAssignmentByShepherdId(client, profileId),
    fetchGenericFollowUpCountForAssignee(client, profileId),
    fetchLedGroupSummariesForProfile(client, profileId),
    canReadPrivateNotes
      ? fetchPrivateNoteKeySlotsForCreator(client, creatorProfileId)
      : Promise.resolve({
          data: [] as PrivateNoteKeySlot[],
          error: null as Error | null,
        }),
  ]);

  if (profile.error) {
    return {
      kind: "ok",
      profileFullName: "Unknown",
      profileRole: "—",
      care: null,
      interactions: [],
      followUps: [],
      genericFollowUpCount: 0,
      ledGroups: [],
      activeOverShepherds: [],
      coverage: null,
      privateNote: null,
      privateNoteKeySlots: [],
      error: profile.error.message,
    };
  }
  if (!profile.data) return { kind: "not_found" };

  // Only leaders / co-leaders are valid care targets. Reject everything
  // else with 404 so admins can't open care for the wrong role.
  if (profile.data.role !== "leader" && profile.data.role !== "co_leader") {
    return { kind: "not_found" };
  }
  if (profile.data.status !== "active") return { kind: "not_found" };
  if (careResult.error) {
    return {
      kind: "ok",
      profileFullName: profile.data.full_name,
      profileRole: profile.data.role,
      care: null,
      interactions: [],
      followUps: [],
      genericFollowUpCount: genericCountRes.data ?? 0,
      ledGroups: ledGroupsRes.data ?? [],
      activeOverShepherds: overShepherdsRes.data ?? [],
      coverage: null,
      privateNote: null,
      privateNoteKeySlots: keySlotsRes.data ?? [],
      error: careResult.error.message,
    };
  }

  // Interaction history and care follow-ups both hang off the care profile
  // row, so only fetch them once we know it exists.
  let interactions: ShepherdCareInteractionsRow[] = [];
  let followUps: ShepherdCareFollowUpsRow[] = [];
  let privateNote: PrivateNoteCiphertext | null = null;
  let childError: string | null = null;
  if (careResult.data) {
    const [inter, fus, note] = await Promise.all([
      fetchShepherdCareInteractionsForAdmin(client, careResult.data.id),
      fetchShepherdCareFollowUpsForProfile(client, careResult.data.id),
      canReadPrivateNotes
        ? fetchShepherdCarePrivateNoteCiphertextForCreator(
            client,
            careResult.data.id,
            creatorProfileId
          )
        : Promise.resolve({
            data: null as PrivateNoteCiphertext | null,
            error: null as Error | null,
          }),
    ]);
    if (inter.error) childError = inter.error.message;
    else interactions = inter.data;
    if (fus.error) childError = childError ?? fus.error.message;
    else followUps = fus.data;
    if (note.error) childError = childError ?? note.error.message;
    else privateNote = note.data;
  }

  return {
    kind: "ok",
    profileFullName: profile.data.full_name,
    profileRole: profile.data.role,
    care: careResult.data,
    interactions,
    followUps,
    genericFollowUpCount: genericCountRes.data ?? 0,
    ledGroups: ledGroupsRes.data ?? [],
    activeOverShepherds: overShepherdsRes.data ?? [],
    coverage: coverageRes.data ?? null,
    privateNote,
    privateNoteKeySlots: keySlotsRes.data ?? [],
    error:
      childError ??
      overShepherdsRes.error?.message ??
      coverageRes.error?.message ??
      genericCountRes.error?.message ??
      ledGroupsRes.error?.message ??
      keySlotsRes.error?.message ??
      null,
  };
}

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

  const detail = await loadDetail(
    profileId,
    creatorProfileId,
    actorRole === "ministry_admin"
  );
  if (detail.kind === "not_found") notFound();
  if (detail.kind === "db_unavailable") {
    return (
      <>
        <PageHeader
          eyebrow="Care"
          title="Leader"
          italic="care"
          lede="Database is not configured in this environment."
        />
        <PageBody>
          <Link
            href="/admin/shepherd-care"
            style={{ color: P.ink2, textDecoration: "underline" }}
          >
            Back to directory
          </Link>
        </PageBody>
      </>
    );
  }

  const roleLabel = detail.profileRole === "leader" ? "Leader" : "Co-leader";
  const today = currentUtcDateIso();

  // Current Ministry Year, shared by the Leader-Health Grade (#378) and the
  // per-group Group-Health Grade (#377) reads below. Off-season (Jun/Jul) has no
  // ministry year, so the grade controls are suppressed then.
  const ministryYear = currentMinistryYear();

  // Leader-Health Grade (#378): the symmetric per-leader rubric grade, keyed to
  // the current Ministry Year. Loaded here (admin-only by RLS) for the distinct
  // "Leader Health" tab below. A separate, surgical read so the existing
  // loadDetail shape is untouched; failures degrade to an empty editor.
  let leaderRubricCriteria: RubricCriterion[] = [];
  let leaderGrade: LeaderRubricGradeRow | null = null;
  // A transient read failure must NOT seed the editor with empty scores — saving
  // from that state would overwrite an existing grade with a blank one. Track it
  // and block the editor (showing an error) rather than degrading to empty.
  let leaderGradeReadFailed = false;
  {
    const client = await createSupabaseServerClient();
    if (client) {
      const [rubricRes, gradeRes] = await Promise.all([
        fetchLeaderHealthRubric(client),
        ministryYear !== null
          ? fetchLeaderRubricGrade(client, profileId, ministryYear)
          : Promise.resolve({ data: null, error: null as Error | null }),
      ]);
      leaderRubricCriteria = rubricRes.data?.criteria ?? [];
      leaderGrade = gradeRes.data ?? null;
      leaderGradeReadFailed = Boolean(rubricRes.error || gradeRes.error);
    }
  }

  // Resolve the stored leader override against the current period BEFORE seeding
  // the editor: a "this_month" override set in an earlier month has expired, so
  // it must seed as "no override" rather than render active and re-post itself
  // forward under the current month on the next save.
  const leaderPeriodMonth = currentPeriodMonthIso();
  const leaderResolved =
    ministryYear !== null
      ? resolveLeaderGrade({
          rubric: { criteria: leaderRubricCriteria },
          scores: leaderGrade?.criterion_scores ?? {},
          override:
            leaderGrade?.override_letter && leaderGrade?.override_scope
              ? {
                  letter: leaderGrade.override_letter,
                  scope: leaderGrade.override_scope,
                  period_month:
                    leaderGrade.override_period_month ?? leaderPeriodMonth,
                }
              : null,
          ministryYear,
          currentPeriodMonth: leaderPeriodMonth,
        })
      : null;

  // Group-Health Grade by rubric (#377): for each group this leader leads, load
  // the configured group rubric criteria + the group's grade for the current
  // ministry year so the Group panel can host the per-group grade-entry control.
  const gradeClient =
    ministryYear !== null && detail.ledGroups.length > 0
      ? await createSupabaseServerClient()
      : null;
  const groupRubricRes =
    gradeClient !== null ? await fetchHealthRubric(gradeClient, "group") : null;
  const rubricCriteria = decodeRubricCriteria(
    groupRubricRes?.data?.criteria ?? null
  );
  // A failed group-rubric read taints every group's editor (empty criteria); a
  // failed per-group grade read taints just that group. Either way we block the
  // affected editor instead of seeding empty scores that could overwrite a grade.
  const groupRubricReadFailed = Boolean(groupRubricRes?.error);
  const gradeByGroupId = new Map<string, GroupRubricGradeView>();
  const gradeReadFailed = new Set<string>();
  if (gradeClient !== null && ministryYear !== null) {
    await Promise.all(
      detail.ledGroups.map(async (g) => {
        const res = await getGroupRubricGrade(gradeClient, g.id, ministryYear);
        if (res.error) gradeReadFailed.add(g.id);
        else if (res.data) gradeByGroupId.set(g.id, res.data);
      })
    );
  }

  const tabRaw = (await searchParams)?.tab;
  const tabParam = Array.isArray(tabRaw) ? tabRaw[0] : tabRaw;

  const assignedGroupLabel =
    detail.ledGroups.length > 0
      ? detail.ledGroups.map((g) => g.name).join(", ")
      : "No group assigned";

  // Overview — leader summary, assigned group, care status, next action, plus
  // coverage and the care-action forms.
  const overviewPanel = (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={cardStyle} aria-label="Care summary">
        <div
          className="lg-m-grid-stack"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 18,
          }}
        >
          <div>
            <span style={labelStyle}>Role</span>
            <div style={valueStyle}>{roleLabel}</div>
          </div>
          <div>
            <span style={labelStyle}>Assigned group</span>
            <div style={valueStyle}>{assignedGroupLabel}</div>
          </div>
          <div>
            <span style={labelStyle}>Current status</span>
            <div style={valueStyle}>
              {detail.care ? (
                <ShepherdCareStatusBadge status={detail.care.current_status} />
              ) : (
                <span style={{ color: P.ink3 }}>Not set</span>
              )}
            </div>
          </div>
          <div>
            <span style={labelStyle}>Last contact</span>
            <div style={valueStyle}>
              {formatIsoDateOr(detail.care?.last_contact_at ?? null, "Never")}
            </div>
          </div>
          <div>
            <span style={labelStyle}>Next touchpoint</span>
            <div style={valueStyle}>
              {formatIsoDateOr(detail.care?.next_touchpoint_due ?? null)}
            </div>
          </div>
        </div>
        {detail.care?.admin_summary ? (
          <div style={{ marginTop: 16 }}>
            <span style={labelStyle}>Admin summary</span>
            <p style={{ ...valueStyle, margin: 0, whiteSpace: "pre-wrap" }}>
              {detail.care.admin_summary}
            </p>
          </div>
        ) : null}
      </section>

      <section style={cardStyle} aria-label="Over-shepherd coverage">
        <h2 style={sectionHeadingStyle}>Coverage</h2>
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: "0 0 12px",
          }}
        >
          {detail.coverage
            ? `Currently covered by ${detail.coverage.over_shepherd.full_name}.`
            : "No over-shepherd assigned yet."}
        </p>
        <CoverageAssignmentForm
          shepherdProfileId={profileId}
          activeOverShepherds={detail.activeOverShepherds}
          currentAssignmentId={detail.coverage?.id ?? null}
          currentOverShepherdId={detail.coverage?.over_shepherd_id ?? null}
        />
      </section>

      <section style={cardStyle} aria-label="Care actions">
        <h2 style={sectionHeadingStyle}>Care actions</h2>
        <CareActions
          shepherdProfileId={profileId}
          current={detail.care}
          leaderName={detail.profileFullName}
        />
        {actorRole === "super_admin" ? (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: `1px solid ${P.line}`,
            }}
          >
            <span style={labelStyle}>Reset attention (super admin)</span>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink2,
                margin: "0 0 8px",
                lineHeight: 1.45,
              }}
            >
              Clear this leader from the care queue with a fresh-start baseline
              — clears their touchpoint and returns status to “doing well”
              without deleting contact history. Recoverable from Super Admin →
              Danger Zone.
            </p>
            <AttentionResetEntityButton
              surface="care"
              entityId={profileId}
              entityLabel={detail.profileFullName}
            />
          </div>
        ) : null}
      </section>
    </div>
  );

  const contactHistoryPanel = (
    <section style={cardStyle} aria-label="Interaction history">
      <h2 style={sectionHeadingStyle}>Contact history</h2>
      <InteractionTimeline interactions={detail.interactions} />
    </section>
  );

  const followUpsPanel = (
    <section style={cardStyle} aria-label="Care follow-ups">
      <h2 style={sectionHeadingStyle}>Care follow-ups</h2>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: "0 0 12px",
        }}
      >
        Open and completed tasks for this leader. Overdue items show first.
        {detail.genericFollowUpCount > 0
          ? ` They're also assigned to ${detail.genericFollowUpCount} open general follow-up${detail.genericFollowUpCount === 1 ? "" : "s"}.`
          : ""}
      </p>
      {detail.care ? (
        <CareFollowUpsSection
          careProfileId={detail.care.id}
          shepherdProfileId={profileId}
          followUps={detail.followUps}
          todayIso={today}
          leaderName={detail.profileFullName}
        />
      ) : (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          Log an interaction or set the care profile first to start adding
          follow-ups.
        </p>
      )}
    </section>
  );

  // Notes — ministry_admin-only private pastoral notes. Built (and the tab
  // offered) ONLY for ministry_admin so the private-note boundary (ADR 0002)
  // stays intact; over-shepherd / leader surfaces never get this tab.
  const notesPanel =
    detail.care && actorRole === "ministry_admin" ? (
      <PrivateNotesSection
        careProfileId={detail.care.id}
        creatorProfileId={creatorProfileId}
        shepherdProfileId={profileId}
        initialNote={detail.privateNote}
        initialSlots={detail.privateNoteKeySlots}
      />
    ) : null;

  const groupPanel = (
    <section style={cardStyle} aria-label="Group">
      <h2 style={sectionHeadingStyle}>Group</h2>
      {detail.ledGroups.length > 0 ? (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: 10,
          }}
        >
          {detail.ledGroups.map((g) => {
            const gradeView = gradeByGroupId.get(g.id);
            return (
              <li key={g.id} style={{ display: "grid", gap: 8 }}>
                <Link
                  href={`/admin/groups/${g.id}`}
                  style={{
                    fontFamily: fontBody,
                    fontSize: 14,
                    color: P.ink,
                    textDecoration: "underline",
                  }}
                >
                  {g.name} →
                </Link>
                {ministryYear !== null ? (
                  groupRubricReadFailed || gradeReadFailed.has(g.id) ? (
                    <p role="alert" style={gradeReadErrorStyle}>
                      This group&rsquo;s grade couldn&rsquo;t be loaded. Reload
                      before editing — saving now could overwrite the saved
                      grade.
                    </p>
                  ) : (
                    <GroupRubricGradeEntry
                      groupId={g.id}
                      groupName={g.name}
                      ministryYear={ministryYear}
                      criteria={rubricCriteria}
                      initialScores={gradeView?.criterion_scores ?? {}}
                      initialOverrideLetter={
                        gradeView?.grade.overridden
                          ? gradeView.grade.effective_letter
                          : null
                      }
                      initialOverrideScope={
                        gradeView?.grade.override_scope ?? null
                      }
                    />
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          This leader isn&rsquo;t assigned to an active group.
        </p>
      )}
    </section>
  );

  // Leader Health — the rubric-driven Leader-Health Grade entry, deliberately a
  // separate tab/card from the Overview's Care Status. The two are distinct
  // concepts (a graded report card vs a pastoral signal) and must read that way.
  const leaderHealthPanel = (
    <section style={cardStyle} aria-label="Leader-Health Grade">
      <h2 style={sectionHeadingStyle}>Leader-Health Grade</h2>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: "0 0 14px",
          lineHeight: 1.5,
        }}
      >
        A rubric-driven A–F grade for this leader, scored against the
        Leader-Health Rubric and kept for the ministry year. This is separate
        from their Care Status above — it&rsquo;s a report card, not a pastoral
        signal.
      </p>
      {leaderGradeReadFailed ? (
        <p role="alert" style={gradeReadErrorStyle}>
          This leader&rsquo;s grade couldn&rsquo;t be loaded. Reload before
          editing — saving now could overwrite the saved grade.
        </p>
      ) : (
        <LeaderHealthGradeEditor
          profileId={profileId}
          leaderName={detail.profileFullName}
          ministryYear={ministryYear}
          criteria={leaderRubricCriteria}
          initialScores={leaderGrade?.criterion_scores ?? {}}
          initialOverrideLetter={
            leaderResolved?.overridden ? leaderResolved.letter : null
          }
          initialOverrideScope={leaderResolved?.override_scope ?? null}
        />
      )}
    </section>
  );

  // Pivot slice 9 (#381 / ADR 0017): the per-person transparency toggle + the
  // (RLS-filtered) Care Notes + Prayer Requests. The grant gates the ladder's
  // read, so when it is off the note/prayer reads return nothing by construction
  // (RLS withholds the rows) — the section explains the sealed state inline. The
  // grant read is admin-only by RLS; this page is requireAdmin().
  const careNotesClient = await createSupabaseServerClient();
  let transparencyGranted = false;
  let careNotes: CareNotesRow[] = [];
  let prayerRequests: PrayerRequestsRow[] = [];
  // Pivot slice 11 (#382 / ADR 0020): the GROUP notes this leader authored. RLS
  // gates them on the SAME per-leader grant (the leader is their author), so they
  // come back only when the toggle is on — sealed by default, exactly like the
  // OS-authored notes about this leader above.
  let authoredGroupCareNotes: AuthoredGroupNote[] = [];
  let authoredGroupPrayerRequests: AuthoredGroupNote[] = [];
  if (careNotesClient) {
    const [grantRes, notesRes, prayersRes, groupNotesRes, groupPrayersRes] =
      await Promise.all([
        fetchNoteTransparencyGrant(careNotesClient, profileId),
        fetchCareNotesForSubject(careNotesClient, profileId),
        fetchPrayerRequestsForSubject(careNotesClient, profileId),
        fetchAuthoredGroupCareNotes(careNotesClient, profileId),
        fetchAuthoredGroupPrayerRequests(careNotesClient, profileId),
      ]);
    transparencyGranted = grantRes.data?.granted ?? false;
    careNotes = notesRes.data ?? [];
    prayerRequests = prayersRes.data ?? [];

    // Resolve the group name for each authored group note for display context.
    const groupNoteRows = groupNotesRes.data ?? [];
    const groupPrayerRows = groupPrayersRes.data ?? [];
    const groupIds = Array.from(
      new Set(
        [...groupNoteRows, ...groupPrayerRows]
          .map((r) => r.subject_group_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    const groupNameById = new Map<string, string>();
    if (groupIds.length > 0) {
      const groupsRes = await fetchGroupsByIds(careNotesClient, groupIds);
      for (const g of groupsRes.data ?? []) groupNameById.set(g.id, g.name);
    }
    const toAuthoredNote = (r: {
      id: string;
      body: string;
      created_at: string;
      subject_group_id: string | null;
    }): AuthoredGroupNote => ({
      id: r.id,
      body: r.body,
      created_at: r.created_at,
      groupName: r.subject_group_id
        ? (groupNameById.get(r.subject_group_id) ?? "their group")
        : "their group",
    });
    authoredGroupCareNotes = groupNoteRows.map(toAuthoredNote);
    authoredGroupPrayerRequests = groupPrayerRows.map(toAuthoredNote);
  }
  const careNotesPanel = (
    <CareNotesSection
      subjectProfileId={profileId}
      granted={transparencyGranted}
      careNotes={careNotes}
      prayerRequests={prayerRequests}
      authoredGroupCareNotes={authoredGroupCareNotes}
      authoredGroupPrayerRequests={authoredGroupPrayerRequests}
    />
  );

  const tabs = [
    { key: "overview", label: "Overview", panel: overviewPanel },
    { key: "leader-health", label: "Leader Health", panel: leaderHealthPanel },
    {
      key: "contact-history",
      label: "Contact History",
      panel: contactHistoryPanel,
    },
    { key: "follow-ups", label: "Follow-ups", panel: followUpsPanel },
    ...(notesPanel
      ? [{ key: "notes", label: "Notes", panel: notesPanel }]
      : []),
    {
      key: "care-notes",
      label: "Care notes & prayer",
      panel: careNotesPanel,
    },
    { key: "group", label: "Group", panel: groupPanel },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Care"
        title={detail.profileFullName}
        lede="Care notes here are admin-only. They never appear on leader or member surfaces."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <Link
              href="/admin/care"
              style={{
                fontFamily: fontBody,
                color: P.ink2,
                fontSize: 13,
                textDecoration: "underline",
              }}
            >
              ← Back to Care
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

          <LeaderDetailTabs tabs={tabs} initialKey={tabParam} />
        </div>
      </PageBody>
    </>
  );
}

const sectionHeadingStyle = {
  fontFamily: fontSans,
  fontSize: 14,
  letterSpacing: 0.6,
  margin: "0 0 12px",
  color: P.ink,
} as const;
