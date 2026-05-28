import Link from "next/link";
import { Card } from "@/components/lg/Card";
import { Pill, type PillTone } from "@/components/lg/Pill";
import type { LaunchPlanningDashboardSnapshot } from "@/lib/dashboard/types";

// Julian admin OS landing card. Reuses computeLaunchPlan via the
// dashboard query layer so the headline matches /admin/launch-planning.
export function LaunchPlanningSnapshotCard({
  snapshot,
}: {
  snapshot: LaunchPlanningDashboardSnapshot;
}) {
  if (!snapshot.available) {
    return (
      <Card>
        <CardHeader
          eyebrow="Launch planning"
          title="Capacity snapshot"
          href="/admin/launch-planning"
        />
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--c-ink3)",
          }}
        >
          {snapshot.error ?? "Launch-planning data unavailable."}
        </p>
      </Card>
    );
  }

  const riskTone: PillTone =
    snapshot.riskLevel === "launch_needed"
      ? "clay"
      : snapshot.riskLevel === "watch"
        ? "amber"
        : "sage";
  const riskLabel =
    snapshot.riskLevel === "launch_needed"
      ? "Launch needed"
      : snapshot.riskLevel === "watch"
        ? "Watch"
        : "On track";

  const gapDisplay = Math.round(snapshot.capacityGap);
  const demandDisplay = Math.round(snapshot.projectedGroupDemand);

  return (
    <Card>
      <CardHeader
        eyebrow="Launch planning"
        title="Capacity snapshot"
        href="/admin/launch-planning"
        rightSlot={<Pill tone={riskTone}>{riskLabel}</Pill>}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <Stat
          label="Effective capacity"
          value={snapshot.effectiveTotalCapacity}
        />
        <Stat
          label="In groups now"
          value={snapshot.currentParticipants}
        />
        <Stat
          label="Projected demand"
          value={demandDisplay}
        />
        <Stat
          label={gapDisplay > 0 ? "Capacity gap" : "Headroom"}
          value={Math.abs(gapDisplay)}
          tone={gapDisplay > 0 ? "clay" : "sage"}
        />
        <Stat
          label="Recommend new groups"
          value={snapshot.recommendedNewGroups}
          tone={snapshot.recommendedNewGroups > 0 ? "amber" : "ghost"}
        />
      </div>

      {!snapshot.assumptionsAvailable ? (
        <p
          style={{
            margin: "12px 0 0",
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--c-ink3)",
          }}
        >
          No saved assumptions yet — using built-in defaults. Save once in
          Launch planning to persist them.
        </p>
      ) : null}

      <div
        style={{
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          color: "var(--c-ink3)",
        }}
      >
        <span>
          {/* recommendedNewGroups === 0 wins first so the dashboard
              cannot tell admins to launch by a date when capacity is
              already covered — matches /admin/launch-planning's
              recommendation copy, which only attaches a launch-by date
              to the "launch N new groups" path. */}
          {snapshot.recommendedNewGroups === 0
            ? "Capacity holds for the configured window."
            : snapshot.suggestedLaunchByDate
              ? `Suggested launch-by: ${snapshot.suggestedLaunchByDate}`
              : `${snapshot.estimatedNewLeadersNeeded} new leader${snapshot.estimatedNewLeadersNeeded === 1 ? "" : "s"} needed`}
        </span>
        <Link
          href="/admin/launch-planning"
          style={{
            color: "var(--c-ink)",
            textDecoration: "underline",
            fontWeight: 500,
          }}
        >
          Open launch planning →
        </Link>
      </div>
    </Card>
  );
}

function CardHeader({
  eyebrow,
  title,
  href,
  rightSlot,
}: {
  eyebrow: string;
  title: string;
  href: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 14,
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 1.8,
            color: "var(--c-clay)",
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          {eyebrow}
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 20,
            fontWeight: 500,
            color: "var(--c-ink)",
          }}
        >
          {title}
        </h2>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {rightSlot}
        <Link
          href={href}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--c-ink2)",
            textDecoration: "underline",
          }}
        >
          Open →
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: PillTone;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--c-bgDeep)",
        border: "1px solid var(--c-line)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 10.5,
          textTransform: "uppercase",
          letterSpacing: 1.4,
          color: "var(--c-ink3)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            color: "var(--c-ink)",
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {tone && value > 0 ? <Pill tone={tone}>{tone === "sage" ? "ok" : "watch"}</Pill> : null}
      </div>
    </div>
  );
}
