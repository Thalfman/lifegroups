import Link from "next/link";
import { Card } from "@/components/lg/Card";
import { Pill, type PillTone } from "@/components/lg/Pill";
import type { ShepherdCareDashboardSummary } from "@/lib/dashboard/types";

// Julian admin OS landing card. Reuses the same counts the deep
// /admin/shepherd-care page derives via buildShepherdCareDashboardModel,
// so the dashboard headline never drifts from the dedicated surface.
export function ShepherdCareTriageCard({
  summary,
}: {
  summary: ShepherdCareDashboardSummary;
}) {
  if (!summary.available) {
    return (
      <Card>
        <CardHeader
          eyebrow="Shepherd care"
          title="Care triage"
          href="/admin/shepherd-care"
        />
        <UnavailableBody message={summary.error ?? "Care data unavailable."} />
      </Card>
    );
  }

  const overdueTone: PillTone = summary.overdueTouchpoints > 0 ? "clay" : "ghost";
  const needsTone: PillTone = summary.needsAttention > 0 ? "clay" : "ghost";
  const staleTone: PillTone =
    summary.notContactedRecently > 0 ? "amber" : "ghost";
  const noProfileTone: PillTone =
    summary.noCareProfile > 0 ? "amber" : "ghost";
  const coverageTone: PillTone =
    summary.coverageAvailable && summary.unassignedCoverage > 0
      ? "amber"
      : "ghost";

  return (
    <Card>
      <CardHeader
        eyebrow="Shepherd care"
        title="Care triage"
        href="/admin/shepherd-care"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        <Stat
          label="Needs attention"
          value={summary.needsAttention}
          total={summary.totalActiveShepherds}
          tone={needsTone}
        />
        <Stat
          label="Overdue touchpoints"
          value={summary.overdueTouchpoints}
          tone={overdueTone}
        />
        <Stat
          label="Stale contact"
          value={summary.notContactedRecently}
          tone={staleTone}
        />
        <Stat
          label="No care profile"
          value={summary.noCareProfile}
          tone={noProfileTone}
        />
        {summary.coverageAvailable ? (
          <Stat
            label="Unassigned coverage"
            value={summary.unassignedCoverage}
            tone={coverageTone}
          />
        ) : null}
      </div>

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
          {summary.attentionItemsTotal === 0
            ? "Care queue is clear this week."
            : summary.attentionItemsTotal === 1
              ? "1 shepherd in the attention queue."
              : `${summary.attentionItemsTotal} shepherds in the attention queue.`}
        </span>
        <Link
          href="/admin/shepherd-care"
          style={{
            color: "var(--c-ink)",
            textDecoration: "underline",
            fontWeight: 500,
          }}
        >
          Open care directory →
        </Link>
      </div>
    </Card>
  );
}

function CardHeader({
  eyebrow,
  title,
  href,
}: {
  eyebrow: string;
  title: string;
  href: string;
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
  );
}

function Stat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total?: number;
  tone: PillTone;
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
        {total != null ? (
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--c-ink3)",
            }}
          >
            of {total}
          </span>
        ) : null}
        {value > 0 ? <Pill tone={tone}>flagged</Pill> : null}
      </div>
    </div>
  );
}

function UnavailableBody({ message }: { message: string }) {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: "var(--font-body)",
        fontSize: 13,
        color: "var(--c-ink3)",
      }}
    >
      {message}
    </p>
  );
}
