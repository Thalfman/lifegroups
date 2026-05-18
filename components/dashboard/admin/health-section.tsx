import Link from "next/link";
import { StatusCard } from "@/components/dashboard/cards";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { P, fontBody } from "@/lib/pastoral";
import type {
  HealthBucket,
  HealthGroupRow,
  HealthSummary,
} from "@/lib/dashboard/types";
import { SectionLabel } from "./shared";

const BUCKET_TITLE: Record<HealthBucket, string> = {
  submitted: "Submitted",
  missing: "Missing",
  did_not_meet: "Did not meet",
  planned_pause: "Planned pause",
  needs_follow_up: "Needs follow-up",
  watch: "Watch",
  healthy: "Healthy",
};

const BUCKET_TONE: Record<HealthBucket, PTone> = {
  submitted: "healthy",
  missing: "followup",
  did_not_meet: "neutral",
  planned_pause: "pause",
  needs_follow_up: "followup",
  watch: "watch",
  healthy: "healthy",
};

function HealthRow({
  row,
  meetingWeek,
}: {
  row: HealthGroupRow;
  meetingWeek: string;
}) {
  const leaderLine =
    row.leaderNames.length > 0
      ? row.leaderNames.join(" · ")
      : "No leaders assigned";
  return (
    <li
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 10,
        padding: "8px 0",
        borderBottom: `1px solid ${P.line2}`,
      }}
    >
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <Link
          href={`/admin/check-ins/${row.groupId}?week=${meetingWeek}`}
          style={{
            fontFamily: fontBody,
            fontSize: 14,
            color: P.ink,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          {row.name}
        </Link>
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 12,
            color: P.ink3,
          }}
        >
          {leaderLine}
        </span>
      </div>
      {row.followUpNeeded ? (
        <PBadge tone="followup" outline>
          Follow-up
        </PBadge>
      ) : null}
    </li>
  );
}

function Bucket({
  bucket,
  rows,
  meetingWeek,
}: {
  bucket: HealthBucket;
  rows: HealthGroupRow[];
  meetingWeek: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SectionLabel>{BUCKET_TITLE[bucket]}</SectionLabel>
        <PBadge tone={BUCKET_TONE[bucket]} outline>
          {rows.length}
        </PBadge>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((row) => (
          <HealthRow key={row.groupId} row={row} meetingWeek={meetingWeek} />
        ))}
      </ul>
    </div>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: PTone;
}) {
  const accent =
    tone === "followup"
      ? P.terra
      : tone === "watch"
        ? P.mustard
        : tone === "healthy"
          ? P.sage
          : P.ink;
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "10px 12px",
        display: "grid",
        gap: 2,
      }}
    >
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 22,
          fontWeight: 500,
          color: accent,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 11,
          color: P.ink3,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function HealthSection({
  summary,
  meetingWeek,
}: {
  summary: HealthSummary;
  meetingWeek: string;
}) {
  return (
    <StatusCard
      title="Health & check-ins"
      eyebrow="What this week is saying"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: 8,
          marginBottom: 18,
        }}
      >
        <CountTile
          label="Submitted"
          value={summary.counts.submitted}
          tone="healthy"
        />
        <CountTile
          label="Missing"
          value={summary.counts.missing}
          tone="followup"
        />
        <CountTile
          label="Did not meet"
          value={summary.counts.did_not_meet}
        />
        <CountTile
          label="Planned pause"
          value={summary.counts.planned_pause}
        />
        <CountTile
          label="Needs follow-up"
          value={summary.counts.needs_follow_up}
          tone="followup"
        />
        <CountTile
          label="Watch"
          value={summary.counts.watch}
          tone="watch"
        />
        <CountTile
          label="Healthy"
          value={summary.counts.healthy}
          tone="healthy"
        />
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        <Bucket
          bucket="needs_follow_up"
          rows={summary.needsFollowUp}
          meetingWeek={meetingWeek}
        />
        <Bucket
          bucket="watch"
          rows={summary.watch}
          meetingWeek={meetingWeek}
        />
        <Bucket
          bucket="missing"
          rows={summary.missing}
          meetingWeek={meetingWeek}
        />
        <Bucket
          bucket="did_not_meet"
          rows={summary.didNotMeet}
          meetingWeek={meetingWeek}
        />
        <Bucket
          bucket="planned_pause"
          rows={summary.plannedPause}
          meetingWeek={meetingWeek}
        />
      </div>
      {summary.needsFollowUp.length === 0 &&
      summary.watch.length === 0 &&
      summary.missing.length === 0 &&
      summary.didNotMeet.length === 0 &&
      summary.plannedPause.length === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          Quiet week — no missing, watch, follow-up, did-not-meet, or paused
          groups to surface.
        </p>
      ) : null}
    </StatusCard>
  );
}
