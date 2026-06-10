import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { CoverageAssignmentForm } from "@/components/admin/shepherd-care/coverage-assignment-form";
import { CareActions } from "@/components/admin/shepherd-care/care-actions";
import { CareFollowUpsSection } from "@/components/admin/shepherd-care/care-follow-ups-section";
import { InteractionTimeline } from "@/components/admin/shepherd-care/interaction-timeline";
import { PrivateNotesSection } from "@/components/admin/shepherd-care/private-notes-section";
import { CareNotesSection } from "@/components/admin/shepherd-care/care-notes-section";
import { ShepherdCareStatusBadge } from "@/components/admin/shepherd-care/status-badge";
import { AttentionResetEntityButton } from "@/components/admin/attention-reset-entity-button";
import { SuperAdminOnlyBadge } from "@/components/admin/super-admin-only-badge";
import { LeaderDetailTabs } from "@/components/admin/shepherd-care/leader-detail-tabs";
import { GroupRubricGradeEntry } from "@/components/admin/care/group-rubric-grade-entry";
import { requireAdmin } from "@/lib/auth/session";
import { loadShepherdCareDetailData } from "@/components/admin/shepherd-care/shepherd-care-detail-data";
import {
  currentMinistryYear,
  currentPeriodMonthIso,
} from "@/lib/admin/ministry-year";
import { currentUtcDateIso } from "@/lib/supabase/read-models";
import { formatIsoDateOr } from "@/lib/shared/date";
import { isUuid } from "@/lib/shared/uuid";
import { LeaderHealthGradeEditor } from "@/components/admin/shepherd-care/leader-health-grade";
import { resolveLeaderGrade } from "@/lib/admin/leader-rubric-grade";
import { P, fontBody, fontSans } from "@/lib/pastoral";

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

  // All reads live behind the reads seam (ADR 0015): the loader binds the live
  // client once and runs the pure buildShepherdCareDetailData assembly, so this
  // page is guard → load → shell.
  const detail = await loadShepherdCareDetailData({
    profileId,
    creatorProfileId,
    canReadPrivateNotes: actorRole === "ministry_admin",
    ministryYear,
  });
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

  // Resolve the stored leader override against the current period BEFORE seeding
  // the editor: a "this_month" override set in an earlier month has expired, so
  // it must seed as "no override" rather than render active and re-post itself
  // forward under the current month on the next save.
  const leaderPeriodMonth = currentPeriodMonthIso();
  const leaderResolved =
    ministryYear !== null
      ? resolveLeaderGrade({
          rubric: { criteria: detail.leaderRubricCriteria },
          scores: detail.leaderGrade?.criterion_scores ?? {},
          override:
            detail.leaderGrade?.override_letter &&
            detail.leaderGrade?.override_scope
              ? {
                  letter: detail.leaderGrade.override_letter,
                  scope: detail.leaderGrade.override_scope,
                  period_month:
                    detail.leaderGrade.override_period_month ??
                    leaderPeriodMonth,
                }
              : null,
          ministryYear,
          currentPeriodMonth: leaderPeriodMonth,
        })
      : null;

  const tabRaw = (await searchParams)?.tab;
  const tabParam = Array.isArray(tabRaw) ? tabRaw[0] : tabRaw;

  const assignedGroupLabel =
    detail.ledGroups.length > 0
      ? detail.ledGroups.map((g) => g.name).join(", ")
      : "No group assigned";

  // "Date of first communication" (the spreadsheet's column C): the earliest
  // logged interaction for this leader. Interactions load newest-first for the
  // timeline, so scan for the minimum interaction_at rather than trusting order.
  const firstContactAt = detail.interactions.reduce<string | null>(
    (earliest, i) =>
      i.interaction_at && (earliest === null || i.interaction_at < earliest)
        ? i.interaction_at
        : earliest,
    null
  );

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
            <span style={labelStyle}>First contact</span>
            <div style={valueStyle}>
              {formatIsoDateOr(firstContactAt, "No contact logged")}
            </div>
          </div>
          <div>
            <span style={labelStyle}>Last contact</span>
            <div style={valueStyle}>
              {formatIsoDateOr(detail.care?.last_contact_at ?? null, "Never")}
            </div>
          </div>
          <div>
            <span style={labelStyle}>Next step</span>
            <div style={valueStyle}>
              {formatIsoDateOr(detail.care?.next_touchpoint_due ?? null)}
            </div>
          </div>
        </div>
        {detail.care?.admin_summary ? (
          <div style={{ marginTop: 16 }}>
            {/* Spreadsheet column B ("Issue") + the running "Misc. note" — the
                admin's plain-language summary of what's going on with this
                leader. Visible up the oversight ladder; the truly sensitive
                layer lives in the encrypted Private note tab. */}
            <span style={labelStyle}>Issue / current concern</span>
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 4,
              }}
            >
              <span style={{ ...labelStyle, marginBottom: 0 }}>
                Reset attention
              </span>
              <SuperAdminOnlyBadge />
            </div>
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
    <section style={cardStyle} aria-label="Updates of communication">
      {/* Spreadsheet column E ("Update of communication"): the append-only
          running log of every call / note / meeting with this leader. */}
      <h2 style={sectionHeadingStyle}>Updates</h2>
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
            const gradeView = detail.gradeByGroupId.get(g.id);
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
                  detail.groupRubricReadFailed ||
                  detail.gradeReadFailedGroupIds.has(g.id) ? (
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
                      criteria={detail.groupRubricCriteria}
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
      {detail.leaderGradeReadFailed ? (
        <p role="alert" style={gradeReadErrorStyle}>
          This leader&rsquo;s grade couldn&rsquo;t be loaded. Reload before
          editing — saving now could overwrite the saved grade.
        </p>
      ) : (
        <LeaderHealthGradeEditor
          profileId={profileId}
          leaderName={detail.profileFullName}
          ministryYear={ministryYear}
          criteria={detail.leaderRubricCriteria}
          initialScores={detail.leaderGrade?.criterion_scores ?? {}}
          initialOverrideLetter={
            leaderResolved?.overridden ? leaderResolved.letter : null
          }
          initialOverrideScope={leaderResolved?.override_scope ?? null}
        />
      )}
    </section>
  );

  // Pivot slice 9 (#381 / ADR 0017): the per-person transparency toggle + the
  // (RLS-filtered) Care Notes + Prayer Requests, loaded behind the reads seam
  // above. When the grant is off the note/prayer reads return nothing by
  // construction (RLS withholds the rows) — the section explains the sealed
  // state inline.
  const careNotesPanel = (
    <CareNotesSection
      subjectProfileId={profileId}
      granted={detail.transparencyGranted}
      careNotes={detail.careNotes}
      prayerRequests={detail.prayerRequests}
      authoredGroupCareNotes={detail.authoredGroupCareNotes}
      authoredGroupPrayerRequests={detail.authoredGroupPrayerRequests}
    />
  );

  const tabs = [
    { key: "overview", label: "Overview", panel: overviewPanel },
    { key: "leader-health", label: "Leader Health", panel: leaderHealthPanel },
    {
      // Key stays "contact-history" so existing ?tab= deep links keep landing
      // here; the label speaks the spreadsheet's "Update of communication".
      key: "contact-history",
      label: "Updates",
      panel: contactHistoryPanel,
    },
    { key: "follow-ups", label: "Follow-ups", panel: followUpsPanel },
    // The spreadsheet's "Misc. note" sensitive layer. Labelled "Private note"
    // (not just "Notes") to disambiguate from the "Care notes & prayer" tab and
    // signal the encrypted, only-you boundary. Key stays "notes" for deep links.
    ...(notesPanel
      ? [{ key: "notes", label: "Private note", panel: notesPanel }]
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
