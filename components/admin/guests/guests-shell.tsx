"use client";

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { pipelineStageLabel } from "@/lib/dashboard/labels";
import type {
  GuestsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import type { GuestPipelineStage } from "@/types/enums";
import { GUEST_PIPELINE_STAGES } from "@/lib/supabase/read-models";
import { GuestCreateForm } from "./guest-create-form";
import { GuestCard } from "./guest-card";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";

export type GuestsManagementData = {
  guests: GuestsRow[];
  groups: GroupsRow[];
  ownerProfiles: ProfilesRow[];
  openFollowUpsByGuest: Record<string, number>;
  errors: {
    guests: string | null;
    groups: string | null;
    profiles: string | null;
    followUps: string | null;
  };
};

const STAGE_TONES: Record<GuestPipelineStage, string> = {
  new: P.terra,
  contacted: P.mustard,
  interested: P.mustard,
  assigned: P.sage,
  attended: P.sage,
  placed: P.sage,
  not_now: P.ink3,
};

export function GuestsManagementShell({ data }: { data: GuestsManagementData }) {
  const { guests, groups, ownerProfiles, openFollowUpsByGuest, errors } = data;
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<GuestPipelineStage | "all">("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const activeGroups = useMemo(
    () => groups.filter((g) => g.lifecycle_status !== "closed"),
    [groups],
  );
  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g] as const)),
    [groups],
  );
  const ownersById = useMemo(
    () => new Map(ownerProfiles.map((p) => [p.id, p] as const)),
    [ownerProfiles],
  );

  const stageCounts = useMemo(() => {
    const counts: Record<GuestPipelineStage, number> = {
      new: 0,
      contacted: 0,
      interested: 0,
      assigned: 0,
      attended: 0,
      placed: 0,
      not_now: 0,
    };
    for (const g of guests) counts[g.pipeline_stage] += 1;
    return counts;
  }, [guests]);

  const filtered = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return guests.filter((g) => {
      if (lower.length > 0 && !g.full_name.toLowerCase().includes(lower)) return false;
      if (stageFilter !== "all" && g.pipeline_stage !== stageFilter) return false;
      if (groupFilter !== "all" && g.assigned_group_id !== groupFilter) return false;
      if (ownerFilter !== "all" && g.follow_up_owner_id !== ownerFilter) return false;
      return true;
    });
  }, [guests, search, stageFilter, groupFilter, ownerFilter]);

  const grouped = useMemo(() => {
    const buckets: Record<GuestPipelineStage, GuestsRow[]> = {
      new: [],
      contacted: [],
      interested: [],
      assigned: [],
      attended: [],
      placed: [],
      not_now: [],
    };
    for (const g of filtered) buckets[g.pipeline_stage].push(g);
    for (const stage of GUEST_PIPELINE_STAGES) {
      buckets[stage].sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
    return buckets;
  }, [filtered]);

  const anyError =
    errors.guests || errors.groups || errors.profiles || errors.followUps;

  return (
    <div style={{ display: "grid", gap: 36 }}>
      {anyError ? (
        <div role="alert" style={alertStyle}>
          One or more reads failed. The page below shows what we did get; retry in
          a moment or check the database connection.
          {errors.guests ? (
            <p style={errorTextStyle}>{errors.guests}</p>
          ) : null}
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Pipeline at a glance"
          title="Where everyone stands"
          description="A live count by stage. The pipeline is manual — no auto-advance, no SMS, no email. You're the one moving people forward."
        />
        <div
          className="lg-m-grid-stack"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 10,
          }}
        >
          {GUEST_PIPELINE_STAGES.map((stage) => (
            <PipelineSummaryCard
              key={stage}
              stage={stage}
              count={stageCounts[stage]}
            />
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="New guest"
          title="Add someone new"
          description="A name is enough to start. You can fill in their pipeline stage, assigned group, owner, and notes here or update them later."
        />
        <Card>
          <GuestCreateForm
            activeGroups={activeGroups}
            historicalGroups={groups}
            ownerProfiles={ownerProfiles}
          />
        </Card>
      </section>

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="The list"
          title="Every guest, by stage"
          description="Use search and filters to find the right person, then update their stage, assignment, owner, or notes inline."
        />
        <div
          className="lg-m-filterbar"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <div>
            <label htmlFor="guests-search" style={fieldLabelStyle}>
              Search by name
            </label>
            <input
              id="guests-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Avery"
              style={fieldInputStyle}
            />
          </div>
          <div>
            <label htmlFor="guests-stage" style={fieldLabelStyle}>
              Stage
            </label>
            <select
              id="guests-stage"
              value={stageFilter}
              onChange={(e) =>
                setStageFilter(e.target.value as GuestPipelineStage | "all")
              }
              style={fieldSelectStyle}
            >
              <option value="all">All stages</option>
              {GUEST_PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {pipelineStageLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="guests-group" style={fieldLabelStyle}>
              Assigned group
            </label>
            <select
              id="guests-group"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              style={fieldSelectStyle}
            >
              <option value="all">Any (or none)</option>
              {activeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="guests-owner" style={fieldLabelStyle}>
              Follow-up owner
            </label>
            <select
              id="guests-owner"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              style={fieldSelectStyle}
            >
              <option value="all">Anyone (or none)</option>
              {ownerProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={emptyStyle}>
            <div
              style={{
                fontFamily: fontDisplay,
                fontSize: 18,
                color: P.ink,
                fontWeight: 500,
              }}
            >
              {guests.length === 0
                ? "No guests yet"
                : "No guests match these filters"}
            </div>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 13.5,
                color: P.ink2,
                margin: "8px 0 0",
                lineHeight: 1.5,
              }}
            >
              {guests.length === 0
                ? "Add your first guest using the form above. A name is enough to start — the rest can come later."
                : "Adjust the search or filters above — or add a new guest at the top."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 28 }}>
            {GUEST_PIPELINE_STAGES.map((stage) => {
              const list = grouped[stage];
              if (list.length === 0) return null;
              return (
                <div key={stage} style={{ display: "grid", gap: 12 }}>
                  <StageHeader
                    stage={stage}
                    count={list.length}
                    totalForStage={stageCounts[stage]}
                  />
                  <ul style={listResetStyle}>
                    {list.map((guest) => (
                      <li key={guest.id} style={{ marginBottom: 14 }}>
                        <GuestCard
                          guest={guest}
                          groupsById={groupsById}
                          ownersById={ownersById}
                          activeGroups={activeGroups}
                          ownerProfiles={ownerProfiles}
                          openFollowUpsCount={
                            openFollowUpsByGuest[guest.id] ?? 0
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PipelineSummaryCard({
  stage,
  count,
}: {
  stage: GuestPipelineStage;
  count: number;
}) {
  const accent = STAGE_TONES[stage];
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "14px 14px 12px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accent,
        }}
      />
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {pipelineStageLabel(stage)}
      </div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: -1,
          color: P.ink,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {count}
      </div>
    </div>
  );
}

function StageHeader({
  stage,
  count,
  totalForStage,
}: {
  stage: GuestPipelineStage;
  count: number;
  totalForStage: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        borderBottom: `1px solid ${P.line}`,
        paddingBottom: 6,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Pipeline stage
        </div>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 20,
            fontWeight: 500,
            color: P.ink,
            letterSpacing: -0.4,
          }}
        >
          {pipelineStageLabel(stage)}
        </div>
      </div>
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 11.5,
          color: P.ink2,
          fontStyle: "italic",
        }}
      >
        {count === totalForStage
          ? `${count} guest${count === 1 ? "" : "s"}`
          : `${count} of ${totalForStage} shown`}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "18px 22px",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

const alertStyle = {
  background: P.terraSoft,
  border: `1px solid ${P.terra}`,
  borderRadius: 8,
  padding: "12px 14px",
  fontFamily: fontBody,
  fontSize: 13,
  color: "#7d3621",
} as const;

const emptyStyle = {
  background: P.bg,
  border: `1px dashed ${P.line}`,
  borderRadius: 14,
  padding: "28px 24px",
  textAlign: "center",
} as const;
