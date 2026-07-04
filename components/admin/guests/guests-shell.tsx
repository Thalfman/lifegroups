"use client";

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { pipelineStageLabel } from "@/lib/dashboard/labels";
import type { GroupsRow, ProfilesRow } from "@/types/database";
import type { GuestPipelineStage } from "@/types/enums";
import {
  GUEST_PIPELINE_STAGES,
  type GuestDirectoryEntry,
} from "@/lib/supabase/guest-reads";
import { EmptyState } from "@/components/ui/empty-state";
import { GuestCreateForm } from "./guest-create-form";
import { GuestCard } from "./guest-card";
import {
  errorTextClassName,
  fieldInputClassName,
  fieldSelectClassName,
} from "@/components/admin/forms/field-styles";
import { FormField } from "@/components/admin/forms/form-field";

export type GuestsManagementData = {
  guests: GuestDirectoryEntry[];
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
  new: "bg-clay",
  contacted: "bg-amber",
  interested: "bg-amber",
  assigned: "bg-sage",
  attended: "bg-sage",
  placed: "bg-sage",
  not_now: "bg-ink3",
};

export function GuestsManagementShell({
  data,
  isSuperAdmin = false,
}: {
  data: GuestsManagementData;
  // SAD9: super-admin-only inline permanent delete of a guest record.
  isSuperAdmin?: boolean;
}) {
  const { guests, groups, ownerProfiles, openFollowUpsByGuest, errors } = data;
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<GuestPipelineStage | "all">(
    "all"
  );
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const activeGroups = useMemo(
    () => groups.filter((g) => g.lifecycle_status !== "closed"),
    [groups]
  );
  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g] as const)),
    [groups]
  );
  const ownersById = useMemo(
    () => new Map(ownerProfiles.map((p) => [p.id, p] as const)),
    [ownerProfiles]
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
      if (lower.length > 0 && !g.full_name.toLowerCase().includes(lower))
        return false;
      if (stageFilter !== "all" && g.pipeline_stage !== stageFilter)
        return false;
      if (groupFilter !== "all" && g.assigned_group_id !== groupFilter)
        return false;
      if (ownerFilter !== "all" && g.follow_up_owner_id !== ownerFilter)
        return false;
      return true;
    });
  }, [guests, search, stageFilter, groupFilter, ownerFilter]);

  const grouped = useMemo(() => {
    const buckets: Record<GuestPipelineStage, GuestDirectoryEntry[]> = {
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
    <div className="grid gap-9">
      {anyError ? (
        <div
          role="alert"
          className="rounded-[8px] border border-clay bg-claySoft px-3.5 py-3 font-sans text-sm text-clayDeep"
        >
          One or more reads failed. The page below shows what we did get; retry
          in a moment or check the database connection.
          {errors.guests ? (
            <p className={errorTextClassName}>{errors.guests}</p>
          ) : null}
        </div>
      ) : null}

      <section className="grid gap-[18px]">
        <SectionHeader
          eyebrow="Pipeline at a glance"
          title="Where everyone stands"
          description="A count by stage. The pipeline is manual: no auto-advance, no SMS, no email; you move each person forward yourself."
        />
        <div className="lg-m-grid-stack grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5">
          {GUEST_PIPELINE_STAGES.map((stage) => (
            <PipelineSummaryCard
              key={stage}
              stage={stage}
              count={stageCounts[stage]}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-[18px]">
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

      <section className="grid gap-[18px]">
        <SectionHeader
          eyebrow="The list"
          title="Every guest, by stage"
          description="Use search and filters to find the right person, then update their stage, assignment, owner, or notes inline."
        />
        <div className="lg-m-filterbar grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <FormField htmlFor="guests-search" label="Search by name">
            <input
              id="guests-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. Avery"
              className={fieldInputClassName}
            />
          </FormField>
          <FormField htmlFor="guests-stage" label="Stage">
            <select
              id="guests-stage"
              value={stageFilter}
              onChange={(e) =>
                setStageFilter(e.target.value as GuestPipelineStage | "all")
              }
              className={fieldSelectClassName}
            >
              <option value="all">All stages</option>
              {GUEST_PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {pipelineStageLabel(s)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField htmlFor="guests-group" label="Assigned group">
            <select
              id="guests-group"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className={fieldSelectClassName}
            >
              <option value="all">Any (or none)</option>
              {activeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField htmlFor="guests-owner" label="Follow-up owner">
            <select
              id="guests-owner"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className={fieldSelectClassName}
            >
              <option value="all">Anyone (or none)</option>
              {ownerProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={
              guests.length === 0
                ? "No guests yet"
                : "No guests match these filters"
            }
            description={
              guests.length === 0
                ? "Add your first guest using the form above. A name is enough to start. The rest can come later."
                : "Adjust the search or filters above, or add a new guest at the top."
            }
          />
        ) : (
          <div className="grid gap-7">
            {GUEST_PIPELINE_STAGES.map((stage) => {
              const list = grouped[stage];
              if (list.length === 0) return null;
              return (
                <div key={stage} className="grid gap-3">
                  <StageHeader
                    stage={stage}
                    count={list.length}
                    totalForStage={stageCounts[stage]}
                  />
                  <ul className="m-0 list-none p-0">
                    {list.map((guest) => (
                      <li key={guest.id} className="mb-3.5">
                        <GuestCard
                          guest={guest}
                          groupsById={groupsById}
                          ownersById={ownersById}
                          activeGroups={activeGroups}
                          ownerProfiles={ownerProfiles}
                          openFollowUpsCount={
                            openFollowUpsByGuest[guest.id] ?? 0
                          }
                          isSuperAdmin={isSuperAdmin}
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
    <div className="relative overflow-hidden rounded-sm border border-line bg-surface px-3.5 pb-3 pt-3.5">
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 h-[3px] ${accent}`}
      />
      <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.4px] text-ink3">
        {pipelineStageLabel(stage)}
      </div>
      <div className="font-display text-3xl font-medium leading-none tracking-[-1px] text-ink tabular-nums">
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
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5">
      <div>
        <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-ink3">
          Pipeline stage
        </div>
        <div className="font-display text-xl font-medium tracking-[-0.4px] text-ink">
          {pipelineStageLabel(stage)}
        </div>
      </div>
      <div className="font-sans text-[11.5px] italic text-ink2">
        {count === totalForStage
          ? `${count} guest${count === 1 ? "" : "s"}`
          : `${count} of ${totalForStage} shown`}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-sm border border-line bg-surface px-[22px] py-[18px]">
      {children}
    </div>
  );
}
