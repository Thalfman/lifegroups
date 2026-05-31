"use client";

import { useActionState, useMemo, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetGroupCapacityTarget } from "@/app/(protected)/admin/launch-planning/actions";
import {
  CAPACITY_STATUS_LABEL,
  filterBoard,
  type CapacityBoardModel,
  type CapacityBoardRow,
  type SuggestedMultiplicationGroup,
} from "@/lib/admin/capacity-board";
import { STAGE_LABEL } from "@/lib/admin/leader-pipeline";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import type { CapacityStatus } from "@/lib/admin/metrics";

type State = ActionResult<{ id: string }> | undefined;

// Status → swatch colour. Full reads "action implied" (terra); Open by choice
// is intentional (sage); Filling is the warning band; Room is calm.
const STATUS_STYLE: Record<
  CapacityStatus,
  { bg: string; border: string; color: string }
> = {
  ok: { bg: P.bg, border: P.line, color: P.ink2 },
  warning: { bg: "#f5e6c8", border: "#e0c98a", color: "#7a5a1e" },
  full: { bg: P.terraSoft, border: P.terra, color: "#7d3621" },
  open_by_choice: { bg: P.sageSoft, border: P.sage, color: "#3e4f29" },
  unknown: { bg: P.bg, border: P.line, color: P.ink3 },
  excluded: { bg: P.bg, border: P.line, color: P.ink3 },
};

function StatusPill({ status }: { status: CapacityStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        fontFamily: fontBody,
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${s.border}`,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {CAPACITY_STATUS_LABEL[status]}
    </span>
  );
}

function ReadyToMultiplyBadge() {
  return (
    <span
      style={{
        fontFamily: fontBody,
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${P.sage}`,
        background: P.sageSoft,
        color: "#3e4f29",
        whiteSpace: "nowrap",
      }}
    >
      ✓ Ready to multiply
    </span>
  );
}

function TargetEditor({ row }: { row: CapacityBoardRow }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminSetGroupCapacityTarget,
    undefined
  );
  return (
    <form
      action={formAction}
      style={{ display: "flex", gap: 6, alignItems: "center" }}
    >
      <input type="hidden" name="group_id" value={row.groupId} />
      <input
        name="target"
        type="number"
        min={1}
        max={500}
        inputMode="numeric"
        defaultValue={row.effectiveTarget ?? ""}
        aria-label={`Target size for ${row.groupName}`}
        style={{ ...fieldInputStyle, width: 72, padding: "6px 8px" }}
      />
      <PButton type="submit" tone="ghost" size="sm" disabled={pending}>
        {pending ? "…" : "Set"}
      </PButton>
      {state && !state.ok ? (
        <span style={{ ...errorTextStyle, padding: "2px 6px" }}>
          {state.errors[0]}
        </span>
      ) : null}
    </form>
  );
}

function BoardRow({ row }: { row: CapacityBoardRow }) {
  return (
    <div
      style={{
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontFamily: fontBody, fontSize: 14, color: P.ink }}>
          {row.groupName}
        </strong>
        <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
          {row.segment}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontFamily: fontBody, fontSize: 13, color: P.ink }}>
          {row.activeMemberCount} / {row.effectiveTarget ?? "—"} members
        </span>
        <StatusPill status={row.status} />
        {row.readyToMultiply ? <ReadyToMultiplyBadge /> : null}
        {row.readyApprentice ? (
          <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2 }}>
            Apprentice: {row.readyApprentice.displayName} (
            {STAGE_LABEL[row.readyApprentice.stage]})
          </span>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={fieldLabelStyle}>Target</span>
        <TargetEditor row={row} />
      </div>
    </div>
  );
}

function SuggestionRow({ s }: { s: SuggestedMultiplicationGroup }) {
  return (
    <div
      style={{
        border: `1px solid ${P.sage}`,
        background: P.sageSoft,
        borderRadius: 10,
        padding: "10px 14px",
        display: "grid",
        gap: 4,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontFamily: fontBody, fontSize: 14, color: P.ink }}>
          {s.groupName}
        </strong>
        <span style={{ fontFamily: fontBody, fontSize: 12, color: "#3e4f29" }}>
          meets {s.metCount}/{s.totalCount}
        </span>
      </div>
      <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2 }}>
        {s.segment} · {s.activeMemberCount}/{s.effectiveTarget ?? "—"} ·{" "}
        {CAPACITY_STATUS_LABEL[s.status]} · {s.readyApprentice.displayName}{" "}
        ready to lead
        {s.alreadyCandidate ? " · already in the plan" : ""}
      </span>
    </div>
  );
}

export function CapacityBoard({ model }: { model: CapacityBoardModel }) {
  const [segment, setSegment] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  const visible = useMemo(
    () =>
      filterBoard(model.rows, {
        segment: segment === "all" ? null : segment,
        status: status === "all" ? null : (status as CapacityStatus),
      }),
    [model.rows, segment, status]
  );

  const statusOptions: CapacityStatus[] = [
    "ok",
    "warning",
    "full",
    "open_by_choice",
    "unknown",
    "excluded",
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {model.suggestions.length > 0 ? (
        <section
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: "20px 22px",
            display: "grid",
            gap: 12,
          }}
        >
          <header>
            <span
              style={{
                fontFamily: fontSans,
                fontSize: 10,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: P.ink3,
                fontWeight: 600,
              }}
            >
              Suggested to multiply
            </span>
            <p
              style={{
                margin: "6px 0 0",
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink3,
                lineHeight: 1.5,
              }}
            >
              Groups at or over target with an apprentice ready to lead. The
              5-criterion readiness is shown as context (&ldquo;meets
              N/5&rdquo;), not a gate.
            </p>
          </header>
          {model.suggestions.map((s) => (
            <SuggestionRow key={s.groupId} s={s} />
          ))}
        </section>
      ) : null}

      <section
        style={{
          background: P.surface,
          border: `1px solid ${P.line}`,
          borderRadius: 14,
          padding: "22px 24px",
          display: "grid",
          gap: 16,
        }}
      >
        <header>
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
            }}
          >
            Capacity board
          </span>
          <h2
            style={{
              margin: "4px 0 0",
              fontFamily: fontBody,
              fontSize: 18,
              color: P.ink,
              fontWeight: 600,
            }}
          >
            All active groups · {model.rows.length}
          </h2>
        </header>

        <div
          className="lg-m-grid-stack"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div>
            <label htmlFor="cb-segment" style={fieldLabelStyle}>
              Segment
            </label>
            <select
              id="cb-segment"
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              style={fieldSelectStyle}
            >
              <option value="all">All segments</option>
              {model.segments.map((seg) => (
                <option key={seg} value={seg}>
                  {seg}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cb-status" style={fieldLabelStyle}>
              Status
            </label>
            <select
              id="cb-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={fieldSelectStyle}
            >
              <option value="all">All statuses</option>
              {statusOptions.map((st) => (
                <option key={st} value={st}>
                  {CAPACITY_STATUS_LABEL[st]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {visible.length === 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              margin: 0,
            }}
          >
            No groups match these filters.
          </p>
        ) : (
          visible.map((row) => <BoardRow key={row.groupId} row={row} />)
        )}
      </section>
    </div>
  );
}
