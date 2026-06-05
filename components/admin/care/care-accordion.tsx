import Link from "next/link";
import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { CareLeaderPanel } from "@/components/admin/care/care-leader-panel";
import type { CareAccordionPane } from "@/lib/admin/care-accordion";

// The canonical Care view (#373, ADR 0016): a collapsible accordion grouped by
// Over-Shepherd, COLLAPSED BY DEFAULT. Each pane expands to the Leaders that
// Over-Shepherd covers; opening a Leader reveals their Leader Care Status and
// the placeholder grade/notes/prayer slots (see CareLeaderPanel). An Unassigned
// pane catches Leaders with no active Over-Shepherd coverage.
//
// Built on native <details>/<summary> so the disclosure works without client
// JS (and stays collapsed by default), matching the existing
// SuperAdminCollapsibleSection pattern. Coverage assignments are the backbone;
// there are deliberately NO headcounts here — only a "N leaders" pane size so
// the scan reads.

function Chevron() {
  return (
    <span aria-hidden="true" style={{ display: "inline-flex", color: P.ink3 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M4 2l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const summaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "14px 18px",
  cursor: "pointer",
};

function leaderCountLabel(count: number): string {
  return `${count} leader${count === 1 ? "" : "s"}`;
}

function CarePane({ pane }: { pane: CareAccordionPane }) {
  return (
    <details
      style={{
        background: P.surface,
        border: `1px solid ${pane.isUnassigned ? P.line2 : P.line}`,
        borderRadius: 12,
      }}
    >
      <summary style={summaryStyle}>
        <Chevron />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: fontSans,
            fontSize: 14,
            fontWeight: 700,
            color: pane.isUnassigned ? P.ink2 : P.ink,
            overflowWrap: "anywhere",
          }}
        >
          {pane.overShepherdName}
        </span>
        <span
          style={{
            fontFamily: fontBody,
            fontSize: 12,
            color: P.ink3,
            whiteSpace: "nowrap",
          }}
        >
          {leaderCountLabel(pane.leaders.length)}
        </span>
      </summary>

      <div style={{ display: "grid", gap: 10, padding: "4px 18px 18px" }}>
        {pane.leaders.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontFamily: fontBody,
              fontSize: 13,
              fontStyle: "italic",
              color: P.ink3,
            }}
          >
            {pane.isUnassigned
              ? "Every leader has an over-shepherd."
              : "No leaders covered yet."}
          </p>
        ) : (
          pane.leaders.map((leader) => (
            <CareLeaderPanel key={leader.profileId} leader={leader} />
          ))
        )}
      </div>
    </details>
  );
}

export function CareAccordion({ panes }: { panes: CareAccordionPane[] }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Coverage maintenance is NOT rebuilt here (#373 req 4): link out to the
          existing over-shepherd coverage surface, which still resolves under
          /admin/shepherd-care (ADR 0008/0009). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
          }}
        >
          Leaders grouped by their over-shepherd. Open a pane to see who they
          cover, then a leader for their care detail.
        </p>
        <Link
          href="/admin/shepherd-care/over-shepherds"
          style={{
            fontFamily: fontSans,
            fontSize: 12.5,
            fontWeight: 600,
            color: P.sageTextStrong,
            textDecoration: "none",
            border: `1px solid ${P.line}`,
            borderRadius: 999,
            padding: "7px 14px",
            whiteSpace: "nowrap",
          }}
        >
          Manage coverage →
        </Link>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {panes.map((pane) => (
          <CarePane key={pane.overShepherdId ?? "unassigned"} pane={pane} />
        ))}
      </div>
    </div>
  );
}
