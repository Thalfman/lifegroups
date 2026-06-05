import type { CSSProperties } from "react";
import type { ProspectState } from "@/types/enums";
import { PROSPECT_STATE_LABEL } from "@/lib/admin/prospect-funnel";
import type { ProspectBoard as Board } from "@/lib/supabase/prospect-reads";
import { ProspectCard } from "@/components/admin/plan/prospect-card";
import type { PlanGroupOption } from "@/components/admin/plan/plan-data";
import { P, fontBody, fontSans } from "@/lib/pastoral";

// The four colour-coded funnel states (acceptance #2). Joined is green but
// rendered as a collapsed roll-up below the active columns (acceptance #4), so
// only the three active states are live columns.
const STATE_COLORS: Record<
  ProspectState,
  { bar: string; tint: string; text: string }
> = {
  interested: { bar: "#d9a521", tint: "#faf0d2", text: "#7a5e10" }, // yellow
  matched: { bar: "#3f72af", tint: "#dde7f3", text: "#274b75" }, // blue
  joined: { bar: "#5f8a4f", tint: "#dfe9d6", text: "#3e5a30" }, // green
  not_at_this_time: { bar: "#c87a3a", tint: "#f4e0cc", text: "#8a4f1c" }, // orange
};

const columnStyle: CSSProperties = {
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  background: P.surface,
  display: "flex",
  flexDirection: "column",
  minHeight: 120,
};

export function ProspectBoardView({
  board,
  groupNamesById,
  activeGroups,
}: {
  board: Board;
  groupNamesById: Record<string, string>;
  activeGroups: PlanGroupOption[];
}) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        {board.columns.map((col) => {
          const c = STATE_COLORS[col.state];
          return (
            <section key={col.state} style={columnStyle}>
              <header
                style={{
                  borderTop: `4px solid ${c.bar}`,
                  background: c.tint,
                  borderTopLeftRadius: 8,
                  borderTopRightRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontFamily: fontSans,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: c.text,
                  }}
                >
                  {PROSPECT_STATE_LABEL[col.state]}
                </span>
                <span
                  style={{
                    fontFamily: fontSans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: c.text,
                  }}
                >
                  {col.prospects.length}
                </span>
              </header>
              <div style={{ padding: 12, display: "grid", gap: 10 }}>
                {col.prospects.length === 0 ? (
                  <p
                    style={{
                      fontFamily: fontBody,
                      fontSize: 13,
                      color: P.ink3,
                      margin: "4px 2px",
                    }}
                  >
                    No prospects here yet.
                  </p>
                ) : (
                  col.prospects.map((p) => (
                    <ProspectCard
                      key={p.id}
                      prospect={p}
                      groupName={
                        p.group_id ? (groupNamesById[p.group_id] ?? null) : null
                      }
                      activeGroups={activeGroups}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <JoinedRollup board={board} />
    </div>
  );
}

// Collapsed Joined roll-up (acceptance #4): joined Prospects leave the active
// board entirely. They appear only here, name + group, with no count column /
// roster row on the board. Green to match the Joined colour.
function JoinedRollup({ board }: { board: Board }) {
  const c = STATE_COLORS.joined;
  return (
    <details
      style={{
        border: `1px solid ${P.line}`,
        borderLeft: `4px solid ${c.bar}`,
        borderRadius: 10,
        background: c.tint,
        padding: "10px 14px",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontFamily: fontSans,
          fontSize: 13,
          fontWeight: 700,
          color: c.text,
          listStyle: "revert",
        }}
      >
        {PROSPECT_STATE_LABEL.joined} ({board.joined.length})
      </summary>
      {board.joined.length === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
            margin: "10px 2px 2px",
          }}
        >
          No one has joined a group yet.
        </p>
      ) : (
        <ul
          style={{
            margin: "10px 0 0",
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: 6,
          }}
        >
          {board.joined.map((j) => (
            <li
              key={j.id}
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink,
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span>{j.full_name}</span>
              <span style={{ color: P.ink2 }}>{j.groupName ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
