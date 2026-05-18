import Link from "next/link";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { SetupGapRow, SetupGaps } from "@/lib/dashboard/types";
import { SectionLabel } from "./shared";

const GAP_LABEL: Record<"capacity" | "leader" | "meeting_day_time" | "members", string> = {
  capacity: "No capacity",
  leader: "No leader",
  meeting_day_time: "Missing day/time",
  members: "No members",
};

function GapRow({ row }: { row: SetupGapRow }) {
  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 0",
        borderBottom: `1px solid ${P.line2}`,
        alignItems: "baseline",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink,
          fontWeight: 500,
        }}
      >
        {row.name}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {row.gaps.map((g) => (
          <PBadge key={g} tone="neutral" outline>
            {GAP_LABEL[g]}
          </PBadge>
        ))}
      </div>
    </li>
  );
}

function Bucket({
  title,
  rows,
  ctaHref,
  ctaLabel,
  emptyLabel,
}: {
  title: string;
  rows: SetupGapRow[];
  ctaHref: string;
  ctaLabel: string;
  emptyLabel: string;
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <SectionLabel>
          {title} · {rows.length}
        </SectionLabel>
        <Link
          href={ctaHref}
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: P.ink2,
            textDecoration: "none",
            borderBottom: `1px solid ${P.line}`,
            paddingBottom: 1,
          }}
        >
          {ctaLabel}
        </Link>
      </div>
      {rows.length === 0 ? (
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink3,
            fontStyle: "italic",
          }}
        >
          {emptyLabel}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((row) => (
            <GapRow key={`${title}-${row.groupId}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function SetupGapsSection({ gaps }: { gaps: SetupGaps }) {
  const total =
    gaps.counts.noCapacity +
    gaps.counts.noLeader +
    gaps.counts.noMeetingDayTime +
    gaps.counts.noMembers;

  return (
    <StatusCard
      title="Setup gaps"
      eyebrow="Quiet to-do list"
      action={
        total === 0
          ? "All set"
          : `${total} ${total === 1 ? "gap" : "gaps"} flagged`
      }
    >
      {total === 0 ? (
        <EmptyState
          title="Everything is configured"
          description="Every active group has a leader, a meeting day and time, members, and a capacity value."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 18,
          }}
        >
          <Bucket
            title="No capacity"
            rows={gaps.noCapacity}
            ctaHref="/admin/settings"
            ctaLabel="Configure defaults"
            emptyLabel="Every group has a capacity value."
          />
          <Bucket
            title="No leader"
            rows={gaps.noLeader}
            ctaHref="/admin/groups"
            ctaLabel="Assign leaders"
            emptyLabel="Every group has at least one active leader."
          />
          <Bucket
            title="Missing day/time"
            rows={gaps.noMeetingDayTime}
            ctaHref="/admin/groups"
            ctaLabel="Edit meeting info"
            emptyLabel="Every group has a meeting day and time."
          />
          <Bucket
            title="No active members"
            rows={gaps.noMembers}
            ctaHref="/admin/groups"
            ctaLabel="Add members"
            emptyLabel="Every group has at least one active member."
          />
        </div>
      )}
    </StatusCard>
  );
}
