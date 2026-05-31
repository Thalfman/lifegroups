"use client";

import { useActionState, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminAdvanceApprenticeStage,
  adminArchiveApprentice,
  adminCreateApprentice,
  adminUpdateApprentice,
} from "@/app/(protected)/admin/leader-pipeline/actions";
import {
  LEADER_READINESS_STAGES,
  STAGE_LABEL,
  nextStage,
  type ApprenticeView,
  type PipelineRollup,
} from "@/lib/admin/leader-pipeline";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";
import type { ActionResult } from "@/lib/admin/action-result";
import type { LeaderReadinessStage } from "@/types/enums";

type State = ActionResult<{ id: string }> | undefined;

function StageBadge({ stage }: { stage: LeaderReadinessStage }) {
  const ready = stage === "ready_to_lead";
  return (
    <span
      style={{
        fontFamily: fontBody,
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${ready ? P.sage : P.line}`,
        background: ready ? P.sageSoft : P.bg,
        color: ready ? P.ink : P.ink2,
        fontWeight: ready ? 600 : 400,
      }}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

function ApprenticeEditForm({ a }: { a: ApprenticeView }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminUpdateApprentice,
    undefined
  );
  const [archiveState, archiveAction, archivePending] = useActionState<
    State,
    FormData
  >(adminArchiveApprentice, undefined);
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
      <form action={formAction} style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="apprentice_id" value={a.id} />
        <div
          className="lg-m-grid-stack"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div>
            <label style={fieldLabelStyle}>Apprentice name</label>
            <input
              name="display_name"
              type="text"
              maxLength={120}
              defaultValue={a.displayName}
              style={fieldInputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>Readiness stage</label>
            <select
              name="readiness_stage"
              defaultValue={a.stage}
              style={fieldSelectStyle}
            >
              {LEADER_READINESS_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div
          className="lg-m-grid-stack"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div>
            <label style={fieldLabelStyle}>Expected ready by</label>
            <input
              name="expected_ready_on"
              type="date"
              defaultValue={a.expectedReadyOn ?? ""}
              style={fieldInputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>Notes</label>
            <input
              name="notes"
              type="text"
              maxLength={2000}
              defaultValue={a.notes ?? ""}
              style={fieldInputStyle}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PButton type="submit" tone="terra" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </PButton>
          {state && !state.ok ? (
            <span style={errorTextStyle}>{state.errors[0]}</span>
          ) : null}
        </div>
      </form>
      <form action={archiveAction}>
        <input type="hidden" name="apprentice_id" value={a.id} />
        <PButton type="submit" tone="ghost" size="sm" disabled={archivePending}>
          {archivePending ? "Removing…" : "Remove apprentice"}
        </PButton>
        {archiveState && !archiveState.ok ? (
          <span style={errorTextStyle}>{archiveState.errors[0]}</span>
        ) : null}
      </form>
    </div>
  );
}

function AdvanceStageButton({ a }: { a: ApprenticeView }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminAdvanceApprenticeStage,
    undefined
  );
  const next = nextStage(a.stage);
  if (!next) return null;
  return (
    <form action={formAction} style={{ display: "inline" }}>
      <input type="hidden" name="apprentice_id" value={a.id} />
      <input type="hidden" name="readiness_stage" value={next} />
      <PButton type="submit" tone="solid" size="sm" disabled={pending}>
        {pending ? "…" : `Advance to ${STAGE_LABEL[next]}`}
      </PButton>
      {state && !state.ok ? (
        <span style={{ ...errorTextStyle, marginLeft: 8 }}>
          {state.errors[0]}
        </span>
      ) : null}
    </form>
  );
}

function ApprenticeRow({ a }: { a: ApprenticeView }) {
  const [editing, setEditing] = useState(false);
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
        }}
      >
        <strong style={{ fontFamily: fontBody, fontSize: 14, color: P.ink }}>
          {a.displayName}
        </strong>
        <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink2 }}>
          {a.groupName}
          {a.expectedReadyOn ? ` · ready by ${a.expectedReadyOn}` : ""}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <AdvanceStageButton a={a} />
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          style={linkButtonStyle}
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>
      {editing ? <ApprenticeEditForm a={a} /> : null}
    </div>
  );
}

function AddApprenticeForm({
  availableGroups,
}: {
  availableGroups: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    adminCreateApprentice,
    undefined
  );
  if (availableGroups.length === 0) {
    return (
      <p
        style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3, margin: 0 }}
      >
        No active groups to add an apprentice to.
      </p>
    );
  }
  return (
    <form action={formAction} style={{ display: "grid", gap: 10 }}>
      <div
        className="lg-m-grid-stack"
        style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}
      >
        <div>
          <label htmlFor="ap-group" style={fieldLabelStyle}>
            Group
          </label>
          <select
            id="ap-group"
            name="group_id"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="" disabled>
              Select a group…
            </option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ap-name" style={fieldLabelStyle}>
            Apprentice name
          </label>
          <input
            id="ap-name"
            name="display_name"
            type="text"
            maxLength={120}
            placeholder="e.g. Tony L."
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="ap-stage" style={fieldLabelStyle}>
            Stage
          </label>
          <select
            id="ap-stage"
            name="readiness_stage"
            defaultValue="identified"
            style={fieldSelectStyle}
          >
            {LEADER_READINESS_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        className="lg-m-grid-stack"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <div>
          <label htmlFor="ap-date" style={fieldLabelStyle}>
            Expected ready by
          </label>
          <input
            id="ap-date"
            name="expected_ready_on"
            type="date"
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="ap-notes" style={fieldLabelStyle}>
            Notes
          </label>
          <input
            id="ap-notes"
            name="notes"
            type="text"
            maxLength={2000}
            style={fieldInputStyle}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Adding…" : "Add apprentice"}
        </PButton>
        {state && !state.ok ? (
          <span style={errorTextStyle}>{state.errors[0]}</span>
        ) : null}
      </div>
    </form>
  );
}

export function LeaderPipeline({
  rollup,
  availableGroups,
}: {
  rollup: PipelineRollup;
  availableGroups: { id: string; name: string }[];
}) {
  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "22px 24px",
        display: "grid",
        gap: 18,
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
          Leader pipeline
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
          Apprentices by stage
        </h2>
        <p
          style={{
            margin: "6px 0 0",
            fontFamily: fontBody,
            fontSize: 12,
            color: P.ink3,
            lineHeight: 1.5,
          }}
        >
          {rollup.totalApprentices} apprentice
          {rollup.totalApprentices === 1 ? "" : "s"} across the ministry.
          Advance a stage as a leader-in-training grows toward leading the next
          group.
        </p>
      </header>

      <AddApprenticeForm availableGroups={availableGroups} />

      {rollup.stages.map((section) => (
        <div key={section.stage} style={{ display: "grid", gap: 8 }}>
          <h3
            style={{
              margin: 0,
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: P.ink2,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <StageBadge stage={section.stage} />
            <span style={{ color: P.ink3, fontWeight: 400 }}>
              {section.apprentices.length}
            </span>
          </h3>
          {section.apprentices.length === 0 ? (
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink3,
                margin: 0,
              }}
            >
              None at this stage.
            </p>
          ) : (
            section.apprentices.map((a) => <ApprenticeRow key={a.id} a={a} />)
          )}
        </div>
      ))}

      <div style={{ display: "grid", gap: 8 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: fontSans,
            fontSize: 11,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: "#7d3621",
            fontWeight: 600,
          }}
        >
          Groups with no apprentice · {rollup.groupsWithoutApprentice.length}
        </h3>
        {rollup.groupsWithoutApprentice.length === 0 ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
              margin: 0,
            }}
          >
            Every active group has at least one apprentice.
          </p>
        ) : (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: P.ink2,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {rollup.groupsWithoutApprentice.map((g) => g.groupName).join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}

const linkButtonStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.terra,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  textDecoration: "underline",
} as const;
