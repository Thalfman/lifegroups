"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { FeatureFlagsConfig } from "@/lib/admin/feature-flags";
import { buildUsagePanelModel } from "@/lib/admin/super-admin-usage-model";
import type { ProfilesRow, UsageEventsRow } from "@/types/database";
import { MultiCheckboxField } from "@/components/admin/master-calendar/multi-checkbox-field";
import {
  CARD_GRID_CLASS,
  MetricRow,
  SubsectionHeader,
  TWO_CARD_GRID_CLASS,
} from "@/components/admin/super-admin/console-primitives";

// Client child of the (server) UsageWorkspace. The workspace pre-resolves the
// distinct people into a flat {id, name}[] and hands this shell only the coarse,
// serializable usage events + feature flags — the care-sensitive console Maps
// stay server-side. Selection state lives here so the panel filters by person
// instantly, recomputing the same pure usage model with the chosen actors.
export function UsagePanelShell({
  events,
  people,
  featureFlags,
}: {
  events: UsageEventsRow[];
  people: { id: string; name: string }[];
  featureFlags: FeatureFlagsConfig;
}) {
  // Default to every person selected so the first paint matches the unfiltered
  // view (anonymous events included — see the selectedActorIds derivation).
  const [selected, setSelected] = useState<string[]>(() =>
    people.map((p) => p.id)
  );

  // Resolve names for the model from the flat people list (the Map the pure
  // model expects). Only full_name is needed.
  const profilesById = useMemo(
    () =>
      new Map<string, Pick<ProfilesRow, "full_name">>(
        people.map((p) => [p.id, { full_name: p.name }])
      ),
    [people]
  );

  // When everything is selected (the default) treat it as "no filter" so the
  // full window — including anonymous, null-actor events — shows. Only a strict
  // subset narrows the tallies. "Select all" therefore returns to the full view.
  // An empty people list (a window of only anonymous events) likewise counts as
  // unfiltered — `[].every` is true — so that activity stays visible rather than
  // being filtered out by an empty selection.
  const allSelected = people.every((p) => selected.includes(p.id));
  const selectedActorIds = allSelected ? null : selected;

  const usage = buildUsagePanelModel({
    events,
    profilesById,
    featureFlags,
    selectedActorIds,
  });

  if (usage.emptyState === "tracking-off") {
    return (
      <p className="m-0 font-sans text-sm text-ink3">
        Tracking is off and nothing has been recorded. Turn on{" "}
        <strong>Usage &amp; login tracking</strong> in Config → Feature flags to
        start seeing logins and area usage here.
      </p>
    );
  }

  if (usage.emptyState === "tracking-on") {
    return (
      <p className="m-0 font-sans text-sm text-ink3">
        Tracking is on. No activity has been recorded yet — events will appear
        here as users sign in and move around the app.
      </p>
    );
  }

  return (
    <>
      {people.length > 0 ? (
        <MultiCheckboxField
          label="People"
          name="usage-person"
          fieldKey="usage-person"
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          value={selected}
          onChange={setSelected}
        />
      ) : null}

      <div className={CARD_GRID_CLASS}>
        <div className="grid gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-3">
          <MetricRow label="Sign-ins" value={usage.loginCount} />
          <MetricRow label="Area opens" value={usage.areaViewCount} />
          <MetricRow label="People seen" value={usage.peopleSeenCount} />
        </div>
      </div>

      <div className={cn(TWO_CARD_GRID_CLASS, "items-start")}>
        <div className="grid min-w-0 gap-2">
          <SubsectionHeader
            title="Areas opened"
            hint="How often each top-level area was entered, busiest first."
          />
          {usage.areaRows.length === 0 ? (
            <p className="m-0 font-sans text-sm text-ink3">
              No area views recorded yet.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {usage.areaRows.map((row) => (
                <div key={row.area} className="grid gap-1">
                  <div className="flex justify-between gap-3 font-sans text-xs text-ink2">
                    <span>{row.label}</span>
                    <strong className="text-ink">{row.count}</strong>
                  </div>
                  <div
                    aria-hidden
                    className="h-1.5 overflow-hidden rounded-pill bg-lineSoft"
                  >
                    <div
                      className="h-full bg-sage"
                      style={{ width: `${row.barPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid min-w-0 gap-2">
          <SubsectionHeader
            title="Recent sign-ins"
            hint="The latest logins, newest first."
          />
          {usage.recentLogins.length === 0 ? (
            <p className="m-0 font-sans text-sm text-ink3">
              No sign-ins recorded yet.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {usage.recentLogins.map((login) => (
                <div
                  key={login.id}
                  className="flex justify-between gap-3 font-sans text-xs text-ink2"
                >
                  <span className="truncate font-semibold text-ink">
                    {login.name}
                  </span>
                  <span className="whitespace-nowrap">{login.at} UTC</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid min-w-0 gap-2">
        <SubsectionHeader
          title="By person"
          hint="Each person's activity, most active first — sign-ins, area opens, and when they were last seen."
        />
        {usage.byPerson.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink3">
            No per-person activity recorded yet.
          </p>
        ) : (
          <div className="grid gap-1.5">
            {usage.byPerson.map((person) => (
              <div
                key={person.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-sans text-xs text-ink2"
              >
                <span className="truncate font-semibold text-ink">
                  {person.name}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span>
                    <strong className="text-ink">{person.loginCount}</strong>{" "}
                    sign-ins
                  </span>
                  <span>
                    <strong className="text-ink">{person.areaViewCount}</strong>{" "}
                    area opens
                  </span>
                  <span className="whitespace-nowrap">
                    {person.lastSeenAt} UTC
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
