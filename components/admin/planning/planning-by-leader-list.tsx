"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PBadge } from "@/components/pastoral/atoms";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";
import {
  occurrenceAccessibleName,
  groupCalendarLinkName,
} from "@/lib/admin/master-calendar-label";
import {
  groupOccurrencesByLeader,
  occurrenceNeedsCoverage,
  type LeaderGroup,
} from "@/lib/admin/planning-views";
import { occurrenceStatusTone } from "../admin-master-calendar-status";

// "By leader" opinionated view (#331). Buckets the month's occurrences under
// each leader/co-leader (and a trailing "Unassigned" bucket for coverage gaps),
// then — within a leader — groups by group so the repeated "Open group
// calendar" deep-link collapses to ONE entry point per group rather than one
// per occurrence row. Reuses the shared occurrence-accessible-name helper and
// the status stripe so this view reads identically to the flat list.
export function PlanningByLeaderList({
  occurrences,
  monthIso,
  leaderFilter,
  onSelect,
}: {
  occurrences: MasterOccurrence[];
  monthIso: string;
  // The active advanced Leader/co-leader filter (a profile id, or "" for none).
  // When set, grouping must show ONLY that leader's bucket — a co-led group
  // (Dana+Sam) filtered to Dana would otherwise still render a Sam bucket, since
  // the filter keeps an occurrence if ANY of its leaders matches (#331).
  leaderFilter: string;
  onSelect: (o: MasterOccurrence) => void;
}) {
  const leaderGroups = useMemo(
    () =>
      groupOccurrencesByLeader(
        occurrences,
        leaderFilter ? new Set([leaderFilter]) : undefined
      ),
    [occurrences, leaderFilter]
  );

  if (leaderGroups.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {leaderGroups.map((leaderGroup) => (
        <LeaderSection
          key={leaderGroup.profileId ?? "unassigned"}
          leaderGroup={leaderGroup}
          monthIso={monthIso}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function LeaderSection({
  leaderGroup,
  monthIso,
  onSelect,
}: {
  leaderGroup: LeaderGroup;
  monthIso: string;
  onSelect: (o: MasterOccurrence) => void;
}) {
  // Within a leader, fold the occurrences by group so each group is named once
  // and carries a single calendar link (de-noise, #331). Occurrences inside a
  // group stay in date order.
  const groups = useMemo(() => {
    const byGroup = new Map<
      string,
      { groupId: string; groupName: string; occurrences: MasterOccurrence[] }
    >();
    for (const occ of leaderGroup.occurrences) {
      const bucket = byGroup.get(occ.groupId) ?? {
        groupId: occ.groupId,
        groupName: occ.groupName,
        occurrences: [],
      };
      bucket.occurrences.push(occ);
      byGroup.set(occ.groupId, bucket);
    }
    return Array.from(byGroup.values())
      .map((g) => ({
        ...g,
        occurrences: [...g.occurrences].sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        ),
      }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName));
  }, [leaderGroup.occurrences]);

  const isUnassigned = leaderGroup.profileId === null;

  // The "Needs coverage" badge is a STRICT staffing-gap signal — a scheduled
  // real meeting of an active group with no leader (occurrenceNeedsCoverage,
  // #331). The Unassigned bucket also holds cancelled/OFF, non-meeting, and
  // non-active-group rows that are leaderless but NOT actionable gaps, so the
  // badge must reflect the count of genuine gaps, not merely "this bucket has
  // leaderless rows". Show it only when at least one row truly needs coverage.
  const coverageCount = useMemo(
    () =>
      isUnassigned
        ? leaderGroup.occurrences.filter(occurrenceNeedsCoverage).length
        : 0,
    [isUnassigned, leaderGroup.occurrences]
  );

  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "14px 16px",
        display: "grid",
        gap: 12,
      }}
    >
      <h3
        style={{
          fontFamily: fontSans,
          fontSize: 12,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: isUnassigned ? P.terra : P.ink3,
          fontWeight: 700,
          margin: 0,
          paddingBottom: 6,
          borderBottom: `1px solid ${P.line2}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {leaderGroup.name}
        {coverageCount > 0 ? (
          <PBadge tone="followup">
            Needs coverage{coverageCount > 1 ? ` (${coverageCount})` : ""}
          </PBadge>
        ) : null}
      </h3>

      <div style={{ display: "grid", gap: 12 }}>
        {groups.map((group) => (
          <div key={group.groupId} style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontFamily: fontBody,
                  fontSize: 15,
                  fontWeight: 600,
                  color: P.ink,
                }}
              >
                {group.groupName}
              </div>
              {/* ONE entry point per group (#331): the group's calendar, opened
                  to the visible month, rather than a link on every occurrence
                  row. The shared link-name helper carries the leader-section
                  context + a group-id suffix so two same-named groups expose
                  distinct accessible names (the collapsed view drops the
                  per-occurrence date discriminator the list link uses). */}
              <Link
                href={`/admin/groups/${group.groupId}/calendar?month=${monthIso}`}
                aria-label={groupCalendarLinkName({
                  groupId: group.groupId,
                  groupName: group.groupName,
                  leaderName: isUnassigned ? null : leaderGroup.name,
                })}
                style={{
                  fontFamily: fontSans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: P.terra,
                  textDecoration: "none",
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
              >
                Open group calendar →
              </Link>
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "grid",
                gap: 6,
              }}
            >
              {group.occurrences.map((occ) => (
                <OccurrenceRow
                  key={`${occ.groupId}|${occ.date}`}
                  occurrence={occ}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function OccurrenceRow({
  occurrence,
  onSelect,
}: {
  occurrence: MasterOccurrence;
  onSelect: (o: MasterOccurrence) => void;
}) {
  const clock = formatClock(occurrence.inheritedMeetingTime);
  const typeLabel = friendlyEventTypeLabel(occurrence.eventType);
  const tone = occurrenceStatusTone(occurrence.status);
  const needsCoverage = occurrenceNeedsCoverage(occurrence);
  return (
    <li
      style={{
        background: P.bg,
        border: `1px solid ${P.line2}`,
        borderRadius: 10,
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(occurrence)}
        aria-label={occurrenceAccessibleName(occurrence)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "10px 12px 10px 14px",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          fontFamily: fontSans,
          fontSize: 12,
          color: P.ink2,
          minHeight: 44,
        }}
      >
        <span style={{ fontFamily: fontBody, fontWeight: 600, color: P.ink }}>
          {dateLabel(occurrence.date)}
        </span>
        {occurrence.status !== "scheduled" ? (
          <PBadge tone={tone}>
            {friendlyEventStatusLabel(occurrence.status)}
          </PBadge>
        ) : (
          <PBadge tone="healthy">{typeLabel}</PBadge>
        )}
        {needsCoverage ? <PBadge tone="followup">Needs coverage</PBadge> : null}
        {clock ? <span>{clock}</span> : null}
      </button>
    </li>
  );
}
