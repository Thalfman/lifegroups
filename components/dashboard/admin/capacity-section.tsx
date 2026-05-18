import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay, fontMono } from "@/lib/pastoral";
import type {
  CapacityGroupRow,
  CapacitySummary,
} from "@/lib/dashboard/types";
import {
  capacitySourceLabel,
  capacityStatusColor,
  capacityStatusLabel,
  formatCapacityCell,
  SectionLabel,
} from "./shared";

function CapacityMeter({
  utilizationPct,
  status,
}: {
  utilizationPct: number | null;
  status: CapacityGroupRow["status"];
}) {
  const color = capacityStatusColor(status);
  const width =
    utilizationPct == null ? 10 : Math.min(100, Math.max(2, utilizationPct));
  return (
    <div
      role="img"
      aria-label={
        utilizationPct == null
          ? "Capacity unknown"
          : `${Math.round(utilizationPct)} percent of capacity`
      }
      style={{
        height: 6,
        borderRadius: 99,
        background: P.line2,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          height: "100%",
          width: `${width}%`,
          background: color,
          borderRadius: 99,
        }}
      />
    </div>
  );
}

function CapacityRow({ row }: { row: CapacityGroupRow }) {
  const pctLabel =
    row.utilizationPct == null
      ? "—"
      : `${Math.round(row.utilizationPct)}%`;
  return (
    <li
      style={{
        display: "grid",
        gap: 6,
        padding: "10px 0",
        borderBottom: `1px solid ${P.line2}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 14,
            color: P.ink,
            fontWeight: 500,
          }}
        >
          {row.name}
        </span>
        <span
          style={{
            fontFamily: fontMono,
            fontSize: 12,
            color: P.ink2,
          }}
        >
          {row.activeMembers} /{" "}
          {formatCapacityCell(row.effectiveCapacity, row.capacitySource)} ·{" "}
          {pctLabel}
        </span>
      </div>
      <CapacityMeter
        utilizationPct={row.utilizationPct}
        status={row.status}
      />
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span>{capacitySourceLabel(row.capacitySource)}</span>
        {row.excluded ? <span>· Excluded from capacity metrics</span> : null}
        {row.hasManualHealthOverride ? <span>· Manual override</span> : null}
      </div>
    </li>
  );
}

function CapacityBucket({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: CapacityGroupRow[];
  emptyLabel?: string;
}) {
  if (rows.length === 0 && !emptyLabel) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <SectionLabel>
        {title} · {rows.length}
      </SectionLabel>
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
            <CapacityRow key={row.groupId} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function CapacitySection({ summary }: { summary: CapacitySummary }) {
  const totalNonExcluded =
    summary.counts.full +
    summary.counts.warning +
    summary.counts.ok +
    summary.counts.unknown;

  return (
    <StatusCard
      title="Capacity"
      eyebrow="Health of the seats at the table"
      action={
        <span>
          <PBadge tone="followup" outline>
            Full {summary.counts.full}
          </PBadge>{" "}
          <PBadge tone="watch" outline>
            Warning {summary.counts.warning}
          </PBadge>
        </span>
      }
    >
      {totalNonExcluded === 0 && summary.counts.excluded === 0 ? (
        <EmptyState
          title="No active groups"
          description="Capacity buckets will appear here once groups exist."
        />
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {summary.full.length > 0 ? (
            <CapacityBucket title="Full" rows={summary.full} />
          ) : null}
          {summary.warning.length > 0 ? (
            <CapacityBucket title="Near capacity" rows={summary.warning} />
          ) : null}
          <CapacityBucket
            title="OK"
            rows={summary.ok}
            emptyLabel="No groups in the OK band yet."
          />
          {summary.unknown.length > 0 ? (
            <CapacityBucket
              title="Unknown capacity"
              rows={summary.unknown}
            />
          ) : null}
          {summary.excluded.length > 0 ? (
            <CapacityBucket
              title="Excluded from capacity metrics"
              rows={summary.excluded}
            />
          ) : null}
        </div>
      )}
      <div
        style={{
          marginTop: 14,
          fontFamily: fontDisplay,
          fontSize: 12,
          color: P.ink3,
          fontStyle: "italic",
        }}
      >
        Thresholds:{" "}
        {summary.full[0]?.warningPct ?? summary.warning[0]?.warningPct ?? 80}%
        warning · {summary.full[0]?.fullPct ?? 100}% full. Configurable in
        /admin/settings.
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: fontBody,
          fontSize: 11.5,
          color: P.ink3,
        }}
      >
        Legend:{" "}
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 2,
            background: capacityStatusColor("full"),
            marginRight: 4,
          }}
        />
        {capacityStatusLabel("full")} ·{" "}
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 2,
            background: capacityStatusColor("warning"),
            marginRight: 4,
          }}
        />
        {capacityStatusLabel("warning")} ·{" "}
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: 2,
            background: capacityStatusColor("ok"),
            marginRight: 4,
          }}
        />
        {capacityStatusLabel("ok")}
      </div>
    </StatusCard>
  );
}
