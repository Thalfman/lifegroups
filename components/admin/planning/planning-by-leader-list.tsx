"use client";

import Link from "next/link";
import { useMemo } from "react";
import { PBadge } from "@/components/pastoral/atoms";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import { cn } from "@/lib/utils";
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
    <div className="grid gap-3.5">
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
    <section className="grid gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
      <h3
        className={cn(
          "m-0 flex items-center gap-2 border-b border-lineSoft pb-1.5 font-sans text-xs font-bold uppercase tracking-[1.5px]",
          isUnassigned ? "text-clay" : "text-ink3"
        )}
      >
        {leaderGroup.name}
        {coverageCount > 0 ? (
          <PBadge tone="followup">
            Needs coverage{coverageCount > 1 ? ` (${coverageCount})` : ""}
          </PBadge>
        ) : null}
      </h3>

      <div className="grid gap-3">
        {groups.map((group) => (
          <div key={group.groupId} className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="font-sans text-md font-semibold text-ink">
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
                className="font-sans text-2xs font-semibold uppercase tracking-[1.2px] text-clay no-underline"
              >
                Open group calendar →
              </Link>
            </div>
            <ul className="m-0 grid list-none gap-1.5 p-0">
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
    <li className="rounded-sm border border-lineSoft bg-bg">
      <button
        type="button"
        onClick={() => onSelect(occurrence)}
        aria-label={occurrenceAccessibleName(occurrence)}
        className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-2.5 border-none bg-transparent py-2.5 pl-3.5 pr-3 text-left font-sans text-xs text-ink2"
      >
        <span className="font-sans font-semibold text-ink">
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
