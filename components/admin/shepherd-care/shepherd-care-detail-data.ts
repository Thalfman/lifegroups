import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bindReads, type OmitClient } from "@/lib/supabase/reads-seam";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  fetchActiveShepherdCoverageAssignmentByShepherdId,
  fetchAdminShepherdProfileById,
  fetchAuthoredGroupCareNotes,
  fetchAuthoredGroupPrayerRequests,
  fetchCareNotesForSubject,
  fetchGenericFollowUpCountForAssignee,
  fetchGroupsByIds,
  fetchLedGroupSummariesForProfile,
  fetchNoteTransparencyGrant,
  fetchOverShepherdsForAdmin,
  fetchPrayerRequestsForSubject,
  fetchPrivateNoteKeySlotsForCreator,
  fetchShepherdCareFollowUpsForProfile,
  fetchShepherdCareInteractionsForAdmin,
  fetchShepherdCarePrivateNoteCiphertextForCreator,
  fetchShepherdCareProfileByShepherdId,
  type ActiveShepherdCoverageAssignmentSummary,
  type LedGroupSummary,
  type OverShepherdListRow,
  type PrivateNoteCiphertext,
  type PrivateNoteKeySlot,
} from "@/lib/supabase/read-models";
import {
  fetchLeaderHealthRubric,
  fetchLeaderRubricGrade,
  type LeaderRubricGradeRow,
} from "@/lib/admin/leader-health-read";
import { fetchHealthRubric } from "@/lib/supabase/health-rubric-reads";
import {
  getGroupRubricGrade,
  type GroupRubricGradeView,
} from "@/lib/admin/group-rubric-grade-read";
import {
  decodeRubricCriteria,
  type RubricCriterion,
} from "@/lib/admin/health-rubric";
import type { AuthoredGroupNote } from "@/components/admin/shepherd-care/care-notes-section";
import type {
  CareNotesRow,
  PrayerRequestsRow,
  ShepherdCareFollowUpsRow,
  ShepherdCareInteractionsRow,
  ShepherdCareProfilesRow,
} from "@/types/database";

// The shepherd-care detail page's read-orchestration, as a pure function of a
// reads seam (ADR 0015) — the tracer bullet for detail-page migration. The
// per-Leader Care drill-down is the most sensitive Care surface: it carries the
// encrypted Private Care Note (ministry_admin-only, hidden even from the Super
// Admin — ADR 0002 / SC.4) and the grant-gated Care Notes ladder (ADR 0017).
// Its assembly used to bind the live Supabase client four times inside the
// page, so the rules that decide what gets suppressed when a read fails — a
// failed read suppresses its derived section rather than reporting a false
// zero — could only be exercised against a real database. They are now a
// function of `ShepherdCareDetailReads`: production binds the live client
// through `supabaseShepherdCareDetailReads`; a test binds an in-memory adapter
// satisfying the same interface. Two adapters, one seam.

// The detail spine — identity, the care profile and everything that hangs off
// it, coverage, and the ministry_admin-only Private Care Note material.
type ShepherdCareDetailCore = {
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
};

export type ShepherdCareDetailData =
  | { kind: "not_found" }
  | ({
      kind: "ok";
      // Leader-Health Grade (#378): the symmetric per-leader rubric grade,
      // keyed to the current Ministry Year.
      leaderRubricCriteria: RubricCriterion[];
      leaderGrade: LeaderRubricGradeRow | null;
      // A transient read failure must NOT seed the editor with empty scores —
      // saving from that state would overwrite an existing grade with a blank
      // one. The page blocks the editor (showing an error) instead.
      leaderGradeReadFailed: boolean;
      // Group-Health Grade by rubric (#377): the configured group rubric plus
      // each led group's grade for the current ministry year.
      groupRubricCriteria: RubricCriterion[];
      // A failed group-rubric read taints every group's editor (empty
      // criteria); a failed per-group grade read taints just that group.
      groupRubricReadFailed: boolean;
      gradeByGroupId: Map<string, GroupRubricGradeView>;
      gradeReadFailedGroupIds: Set<string>;
      // Pivot slices 9/11 (#381/#382): the per-person transparency grant and
      // the (RLS-filtered) Care Notes + Prayer Requests it gates.
      transparencyGranted: boolean;
      careNotes: CareNotesRow[];
      prayerRequests: PrayerRequestsRow[];
      authoredGroupCareNotes: AuthoredGroupNote[];
      authoredGroupPrayerRequests: AuthoredGroupNote[];
    } & ShepherdCareDetailCore);

// The page-facing result: the pure build's union, plus the no-database case the
// load wrapper reports when Supabase env vars are absent.
export type ShepherdCareDetailResult =
  | ShepherdCareDetailData
  | { kind: "db_unavailable" };

export type ShepherdCareDetailOptions = {
  profileId: string;
  // Scopes the Private Care Note material to its creator (the signed-in admin).
  creatorProfileId: string;
  // SC.4: only a ministry_admin may read private notes. requireAdmin() also
  // admits super_admin, so the caller resolves this from the actor's role and
  // the build gates the reader CALLS on it — never invoke the private-note
  // readers on a super_admin request (no read path, not just no UI).
  canReadPrivateNotes: boolean;
  // The current Ministry Year (null in the Jun/Jul off-season, when the grade
  // reads are skipped and the grade controls are suppressed).
  ministryYear: number | null;
};

export type ShepherdCareDetailReads = {
  fetchProfile: OmitClient<typeof fetchAdminShepherdProfileById>;
  fetchCareProfile: OmitClient<typeof fetchShepherdCareProfileByShepherdId>;
  fetchOverShepherds: OmitClient<typeof fetchOverShepherdsForAdmin>;
  fetchActiveCoverage: OmitClient<
    typeof fetchActiveShepherdCoverageAssignmentByShepherdId
  >;
  fetchGenericFollowUpCount: OmitClient<
    typeof fetchGenericFollowUpCountForAssignee
  >;
  fetchLedGroups: OmitClient<typeof fetchLedGroupSummariesForProfile>;
  fetchPrivateNoteKeySlots: OmitClient<
    typeof fetchPrivateNoteKeySlotsForCreator
  >;
  fetchInteractions: OmitClient<typeof fetchShepherdCareInteractionsForAdmin>;
  fetchFollowUps: OmitClient<typeof fetchShepherdCareFollowUpsForProfile>;
  fetchPrivateNoteCiphertext: OmitClient<
    typeof fetchShepherdCarePrivateNoteCiphertextForCreator
  >;
  fetchLeaderHealthRubric: OmitClient<typeof fetchLeaderHealthRubric>;
  fetchLeaderRubricGrade: OmitClient<typeof fetchLeaderRubricGrade>;
  fetchGroupHealthRubric: OmitClient<typeof fetchHealthRubric>;
  fetchGroupRubricGrade: OmitClient<typeof getGroupRubricGrade>;
  fetchNoteTransparencyGrant: OmitClient<typeof fetchNoteTransparencyGrant>;
  fetchCareNotesForSubject: OmitClient<typeof fetchCareNotesForSubject>;
  fetchPrayerRequestsForSubject: OmitClient<
    typeof fetchPrayerRequestsForSubject
  >;
  fetchAuthoredGroupCareNotes: OmitClient<typeof fetchAuthoredGroupCareNotes>;
  fetchAuthoredGroupPrayerRequests: OmitClient<
    typeof fetchAuthoredGroupPrayerRequests
  >;
  fetchGroupsByIds: OmitClient<typeof fetchGroupsByIds>;
};

// Production adapter: binds the live Supabase client to every read this surface
// needs. The underlying fetchers keep their explicit column allowlists.
export function supabaseShepherdCareDetailReads(
  client: AppSupabaseClient
): ShepherdCareDetailReads {
  return bindReads(client, {
    fetchProfile: fetchAdminShepherdProfileById,
    fetchCareProfile: fetchShepherdCareProfileByShepherdId,
    fetchOverShepherds: fetchOverShepherdsForAdmin,
    fetchActiveCoverage: fetchActiveShepherdCoverageAssignmentByShepherdId,
    fetchGenericFollowUpCount: fetchGenericFollowUpCountForAssignee,
    fetchLedGroups: fetchLedGroupSummariesForProfile,
    fetchPrivateNoteKeySlots: fetchPrivateNoteKeySlotsForCreator,
    fetchInteractions: fetchShepherdCareInteractionsForAdmin,
    fetchFollowUps: fetchShepherdCareFollowUpsForProfile,
    fetchPrivateNoteCiphertext:
      fetchShepherdCarePrivateNoteCiphertextForCreator,
    fetchLeaderHealthRubric,
    fetchLeaderRubricGrade,
    fetchGroupHealthRubric: fetchHealthRubric,
    fetchGroupRubricGrade: getGroupRubricGrade,
    fetchNoteTransparencyGrant,
    fetchCareNotesForSubject,
    fetchPrayerRequestsForSubject,
    fetchAuthoredGroupCareNotes,
    fetchAuthoredGroupPrayerRequests,
    fetchGroupsByIds,
  });
}

// The detail spine. Subject resolution decides 404 vs render; every other read
// degrades to its empty value with the failure surfaced through `error` (the
// page-level banner) — never a silent false zero on a section that did load.
async function buildDetailCore(
  reads: ShepherdCareDetailReads,
  options: {
    profileId: string;
    creatorProfileId: string;
    canReadPrivateNotes: boolean;
  }
): Promise<{ kind: "not_found" } | ({ kind: "ok" } & ShepherdCareDetailCore)> {
  const { profileId, creatorProfileId, canReadPrivateNotes } = options;

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
    reads.fetchProfile(profileId),
    reads.fetchCareProfile(profileId),
    reads.fetchOverShepherds({ includeArchived: false }),
    reads.fetchActiveCoverage(profileId),
    reads.fetchGenericFollowUpCount(profileId),
    reads.fetchLedGroups(profileId),
    canReadPrivateNotes
      ? reads.fetchPrivateNoteKeySlots(creatorProfileId)
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
      reads.fetchInteractions(careResult.data.id),
      reads.fetchFollowUps(careResult.data.id),
      canReadPrivateNotes
        ? reads.fetchPrivateNoteCiphertext(careResult.data.id, creatorProfileId)
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

// Pure assembly: the detail spine first (subject resolution decides 404), then
// the Leader-Health Grade, per-group Group-Health Grades, and the grant-gated
// Care Notes ladder. Every degrade path is reachable from a test through an
// in-memory `reads` adapter.
export async function buildShepherdCareDetailData(
  reads: ShepherdCareDetailReads,
  options: ShepherdCareDetailOptions
): Promise<ShepherdCareDetailData> {
  const { profileId, ministryYear } = options;

  const core = await buildDetailCore(reads, {
    profileId,
    creatorProfileId: options.creatorProfileId,
    canReadPrivateNotes: options.canReadPrivateNotes,
  });
  if (core.kind === "not_found") return { kind: "not_found" };

  // Leader-Health Grade (#378): the symmetric per-leader rubric grade, keyed to
  // the current Ministry Year. Loaded (admin-only by RLS) for the distinct
  // "Leader Health" tab; failures block the editor rather than degrading to
  // empty scores — saving from a blank seed would overwrite an existing grade
  // (#377/#378 read-failure guard).
  const [leaderRubricRes, leaderGradeRes] = await Promise.all([
    reads.fetchLeaderHealthRubric(),
    ministryYear !== null
      ? reads.fetchLeaderRubricGrade(profileId, ministryYear)
      : Promise.resolve({ data: null, error: null as Error | null }),
  ]);
  const leaderRubricCriteria = leaderRubricRes.data?.criteria ?? [];
  const leaderGrade = leaderGradeRes.data ?? null;
  const leaderGradeReadFailed = Boolean(
    leaderRubricRes.error || leaderGradeRes.error
  );

  // Group-Health Grade by rubric (#377): for each group this leader leads, load
  // the configured group rubric criteria + the group's grade for the current
  // ministry year. Off-season (ministryYear null) and group-less leaders skip
  // these reads entirely.
  const loadGroupGrades = ministryYear !== null && core.ledGroups.length > 0;
  const groupRubricRes = loadGroupGrades
    ? await reads.fetchGroupHealthRubric("group")
    : null;
  const groupRubricCriteria = decodeRubricCriteria(
    groupRubricRes?.data?.criteria ?? null
  );
  // A failed group-rubric read taints every group's editor (empty criteria); a
  // failed per-group grade read taints just that group. Either way the page
  // blocks the affected editor instead of seeding empty scores that could
  // overwrite a grade.
  const groupRubricReadFailed = Boolean(groupRubricRes?.error);
  const gradeByGroupId = new Map<string, GroupRubricGradeView>();
  const gradeReadFailedGroupIds = new Set<string>();
  if (ministryYear !== null && core.ledGroups.length > 0) {
    await Promise.all(
      core.ledGroups.map(async (g) => {
        const res = await reads.fetchGroupRubricGrade(g.id, ministryYear);
        if (res.error) gradeReadFailedGroupIds.add(g.id);
        else if (res.data) gradeByGroupId.set(g.id, res.data);
      })
    );
  }

  // Pivot slice 9 (#381 / ADR 0017): the per-person transparency toggle + the
  // (RLS-filtered) Care Notes + Prayer Requests. The grant gates the ladder's
  // read, so when it is off the note/prayer reads return nothing by construction
  // (RLS withholds the rows) — the section explains the sealed state inline. The
  // grant read is admin-only by RLS; the calling page is requireAdmin().
  // Pivot slice 11 (#382 / ADR 0020): the GROUP notes this leader authored. RLS
  // gates them on the SAME per-leader grant (the leader is their author), so
  // they come back only when the toggle is on — sealed by default, exactly like
  // the OS-authored notes about this leader.
  const [grantRes, notesRes, prayersRes, groupNotesRes, groupPrayersRes] =
    await Promise.all([
      reads.fetchNoteTransparencyGrant(profileId),
      reads.fetchCareNotesForSubject(profileId),
      reads.fetchPrayerRequestsForSubject(profileId),
      reads.fetchAuthoredGroupCareNotes(profileId),
      reads.fetchAuthoredGroupPrayerRequests(profileId),
    ]);
  const transparencyGranted = grantRes.data?.granted ?? false;
  const careNotes = notesRes.data ?? [];
  const prayerRequests = prayersRes.data ?? [];

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
    const groupsRes = await reads.fetchGroupsByIds(groupIds);
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
  const authoredGroupCareNotes = groupNoteRows.map(toAuthoredNote);
  // Prayer Requests additionally carry their pastoral status (#474) so the
  // list can render the read-only "Answered" / "Archived" chip.
  const authoredGroupPrayerRequests = groupPrayerRows.map((r) => ({
    ...toAuthoredNote(r),
    status: r.status,
  }));

  return {
    ...core,
    leaderRubricCriteria,
    leaderGrade,
    leaderGradeReadFailed,
    groupRubricCriteria,
    groupRubricReadFailed,
    gradeByGroupId,
    gradeReadFailedGroupIds,
    transparencyGranted,
    careNotes,
    prayerRequests,
    authoredGroupCareNotes,
    authoredGroupPrayerRequests,
  };
}

// Binds the live client (or reports db_unavailable when the DB is not
// configured) and runs the pure assembly. The calling page stays guard → load
// → shell.
export async function loadShepherdCareDetailData(
  options: ShepherdCareDetailOptions
): Promise<ShepherdCareDetailResult> {
  const client = await createSupabaseServerClient();
  if (!client) return { kind: "db_unavailable" };
  return buildShepherdCareDetailData(
    supabaseShepherdCareDetailReads(client),
    options
  );
}
