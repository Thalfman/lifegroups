"use client";

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetMultiplicationConfig } from "@/app/(protected)/admin/settings/actions";
import { P, fontBody } from "@/lib/pastoral";
import {
  fieldInputStyle,
  fieldLabelStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type { GroupAudienceCategory } from "@/types/enums";
import type {
  CapacityOption,
  FedCapacity,
  HealthLetter,
  PillarCondition,
  PillarKey,
  PillarThresholds,
  TriggerRubric,
} from "@/lib/admin/multiplication-pillars";

// Settings Multiplication-config editor (#380). Lets Julian feed the per-type
// Capacity (the Ministry-Admin number that drives the Capacity pillar + the
// individual-group full-count flag) plus two offerable capacity options, and
// configure the trigger rubric — the per-pillar CONDITION (at least / at most /
// between) that produces the "ready to multiply this type" signal. The condition
// is directional because health is not monotonic: high or low can each be the
// signal Julian wants. One type is edited at a time; the editor posts the
// group_type, ministry_year, and the three JSON payloads the audited RPC persists.

const LETTERS: HealthLetter[] = ["A", "B", "C", "D", "F"];
const TRIGGER_PILLARS: { key: PillarKey; label: string }[] = [
  { key: "capacity", label: "Capacity" },
  { key: "overflow", label: "Overflowing groups" },
  { key: "interest", label: "Interest" },
  { key: "groupHealth", label: "Group Health" },
  { key: "leaderHealth", label: "Leader Health" },
];

const DIRECTIONS: { value: "off" | PillarCondition["op"]; label: string }[] = [
  { value: "off", label: "Not required" },
  { value: "atLeast", label: "At least" },
  { value: "atMost", label: "At most" },
  { value: "between", label: "Between" },
];

export type MultiplicationConfigSeed = {
  type: GroupAudienceCategory;
  label: string;
  thresholds: PillarThresholds;
  trigger: TriggerRubric;
  fedCapacity: FedCapacity;
};

// One pillar's editable trigger row: its direction ("off" excludes it) plus the
// primary letter and — for "between" — the worse-bound letter.
type TriggerRow = {
  op: "off" | PillarCondition["op"];
  letter: HealthLetter;
  worst: HealthLetter;
};
type TriggerSelection = Record<string, TriggerRow>;

function seedTriggerSelection(trigger: TriggerRubric): TriggerSelection {
  const out: TriggerSelection = {};
  for (const p of TRIGGER_PILLARS) {
    const condition = trigger.conditions[p.key];
    if (!condition) {
      out[p.key] = { op: "off", letter: "B", worst: "D" };
    } else if (condition.op === "between") {
      out[p.key] = {
        op: "between",
        letter: condition.best,
        worst: condition.worst,
      };
    } else {
      out[p.key] = { op: condition.op, letter: condition.letter, worst: "D" };
    }
  }
  return out;
}

// Up to two capacity-option rows, seeded from the stored options (padded to 2).
type OptionRow = { label: string; capacity: string };
function seedOptionRows(options: CapacityOption[]): [OptionRow, OptionRow] {
  const row = (o: CapacityOption | undefined): OptionRow => ({
    label: o?.label ?? "",
    capacity: o?.capacity != null ? String(o.capacity) : "",
  });
  return [row(options[0]), row(options[1])];
}

export function MultiplicationConfigEditor({
  seeds,
  ministryYear,
}: {
  seeds: MultiplicationConfigSeed[];
  ministryYear: number;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetMultiplicationConfig
  );

  const [activeType, setActiveType] = useState<GroupAudienceCategory>(
    seeds[0]?.type ?? "men"
  );
  const seed = seeds.find((s) => s.type === activeType) ?? seeds[0] ?? null;

  const [headroom, setHeadroom] = useState<string>(
    seed?.fedCapacity.headroom != null ? String(seed.fedCapacity.headroom) : ""
  );
  const [fullGroupCount, setFullGroupCount] = useState<string>(
    String(seed?.fedCapacity.fullGroupCount ?? 0)
  );
  const [requireHealth, setRequireHealth] = useState<boolean>(
    seed?.trigger.requireHealthGrades ?? false
  );
  const [triggerSel, setTriggerSel] = useState<TriggerSelection>(() =>
    seedTriggerSelection(seed?.trigger ?? { conditions: {} })
  );
  const [optionRows, setOptionRows] = useState<[OptionRow, OptionRow]>(() =>
    seedOptionRows(seed?.fedCapacity.options ?? [])
  );

  // When the operator switches type, reset the editable fields from that type's
  // seed so each type edits independently.
  const switchType = (next: GroupAudienceCategory) => {
    setActiveType(next);
    const s = seeds.find((x) => x.type === next);
    setHeadroom(
      s?.fedCapacity.headroom != null ? String(s.fedCapacity.headroom) : ""
    );
    setFullGroupCount(String(s?.fedCapacity.fullGroupCount ?? 0));
    setRequireHealth(s?.trigger.requireHealthGrades ?? false);
    setTriggerSel(seedTriggerSelection(s?.trigger ?? { conditions: {} }));
    setOptionRows(seedOptionRows(s?.fedCapacity.options ?? []));
  };

  // The thresholds aren't edited here (the numeric pillar bands keep their seeded
  // / built-in values); carry them through unchanged so a save doesn't reset
  // them. Capacity + trigger are what Julian sets on this surface.
  const thresholdsJson = JSON.stringify(seed?.thresholds ?? {});

  // Build the per-pillar conditions from the editable rows, dropping "off"
  // pillars. "between" carries both bounds; the others a single letter.
  const conditions: Partial<Record<PillarKey, PillarCondition>> = {};
  for (const p of TRIGGER_PILLARS) {
    const row = triggerSel[p.key];
    if (!row || row.op === "off") continue;
    conditions[p.key] =
      row.op === "between"
        ? { op: "between", best: row.letter, worst: row.worst }
        : { op: row.op, letter: row.letter };
  }
  const triggerJson = JSON.stringify({
    conditions,
    requireHealthGrades: requireHealth,
  });

  const headroomNum = headroom.trim() === "" ? null : Number(headroom);
  // Serialize the two capacity options, dropping a wholly-empty row.
  const options: CapacityOption[] = [];
  for (const row of optionRows) {
    const capNum = row.capacity.trim() === "" ? null : Number(row.capacity);
    const capacity = capNum != null && Number.isFinite(capNum) ? capNum : null;
    if (row.label.trim() === "" && capacity === null) continue;
    options.push({ label: row.label.trim(), capacity });
  }
  const fedCapacityJson = JSON.stringify({
    headroom:
      headroomNum != null && Number.isFinite(headroomNum) ? headroomNum : null,
    fullGroupCount: Number(fullGroupCount) || 0,
    options,
  });

  return (
    <form action={formAction} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="group_type" value={activeType} />
      <input type="hidden" name="ministry_year" value={ministryYear} />
      <input type="hidden" name="thresholds" value={thresholdsJson} />
      <input type="hidden" name="trigger" value={triggerJson} />
      <input type="hidden" name="fed_capacity" value={fedCapacityJson} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {seeds.map((s) => (
          <PButton
            key={s.type}
            type="button"
            tone={s.type === activeType ? "terra" : "ghost"}
            size="sm"
            onClick={() => switchType(s.type)}
            aria-pressed={s.type === activeType}
          >
            {s.label}
          </PButton>
        ))}
      </div>

      <p style={noteStyle}>
        Capacity is fed here per type — it is not derived from in-app counts.
        The full-group count grades the Overflow pillar and raises an individual
        &ldquo;multiply this one&rdquo; flag. The two capacity options are the
        offerings you can present to anyone interested. The trigger sets, per
        pillar, the direction a grade must satisfy to count as ready — health is
        not black-and-white, so high or low can each be your signal. Ministry
        year {ministryYear}–{ministryYear + 1}.
      </p>

      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div>
          <label htmlFor="mc-headroom" style={fieldLabelStyle}>
            Capacity headroom (fed)
          </label>
          <input
            id="mc-headroom"
            type="number"
            inputMode="numeric"
            value={headroom}
            placeholder="e.g. 4"
            onChange={(e) => setHeadroom(e.target.value)}
            style={fieldInputStyle}
          />
        </div>
        <div>
          <label htmlFor="mc-full" style={fieldLabelStyle}>
            Full groups of this type
          </label>
          <input
            id="mc-full"
            type="number"
            min={0}
            inputMode="numeric"
            value={fullGroupCount}
            onChange={(e) => setFullGroupCount(e.target.value)}
            style={fieldInputStyle}
          />
        </div>
      </div>

      <fieldset
        style={{
          border: `1px solid ${P.line}`,
          borderRadius: 10,
          padding: "12px 14px",
          display: "grid",
          gap: 10,
        }}
      >
        <legend
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            padding: "0 6px",
          }}
        >
          Capacity options — up to two offerings for anyone interested
        </legend>
        {optionRows.map((row, i) => (
          <div
            key={i}
            className="lg-m-grid-stack"
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 12,
            }}
          >
            <div>
              <label htmlFor={`mc-opt-label-${i}`} style={fieldLabelStyle}>
                Option {i + 1} label
              </label>
              <input
                id={`mc-opt-label-${i}`}
                type="text"
                value={row.label}
                placeholder={i === 0 ? "e.g. Standard" : "e.g. Larger"}
                onChange={(e) =>
                  setOptionRows((rows) => {
                    const next = [...rows] as [OptionRow, OptionRow];
                    next[i] = { ...next[i], label: e.target.value };
                    return next;
                  })
                }
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label htmlFor={`mc-opt-cap-${i}`} style={fieldLabelStyle}>
                Capacity
              </label>
              <input
                id={`mc-opt-cap-${i}`}
                type="number"
                min={0}
                inputMode="numeric"
                value={row.capacity}
                placeholder="e.g. 12"
                onChange={(e) =>
                  setOptionRows((rows) => {
                    const next = [...rows] as [OptionRow, OptionRow];
                    next[i] = { ...next[i], capacity: e.target.value };
                    return next;
                  })
                }
                style={fieldInputStyle}
              />
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset
        style={{
          border: `1px solid ${P.line}`,
          borderRadius: 10,
          padding: "12px 14px",
          display: "grid",
          gap: 10,
        }}
      >
        <legend
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            padding: "0 6px",
          }}
        >
          Trigger — the condition each pillar must satisfy
        </legend>
        {TRIGGER_PILLARS.map((p) => {
          const row = triggerSel[p.key];
          const update = (patch: Partial<TriggerRow>) =>
            setTriggerSel((s) => ({
              ...s,
              [p.key]: { ...s[p.key], ...patch },
            }));
          return (
            <div
              key={p.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <label htmlFor={`mc-trig-${p.key}`} style={fieldLabelStyle}>
                {p.label}
              </label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  id={`mc-trig-${p.key}`}
                  value={row.op}
                  onChange={(e) =>
                    update({ op: e.target.value as TriggerRow["op"] })
                  }
                  style={{ ...fieldInputStyle, width: 120 }}
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {row.op !== "off" && (
                  <select
                    aria-label={`${p.label} ${
                      row.op === "between" ? "best grade" : "grade"
                    }`}
                    value={row.letter}
                    onChange={(e) =>
                      update({ letter: e.target.value as HealthLetter })
                    }
                    style={{ ...fieldInputStyle, width: 70 }}
                  >
                    {LETTERS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
                {row.op === "between" && (
                  <>
                    <span style={{ ...noteStyle, fontSize: 12 }}>to</span>
                    <select
                      aria-label={`${p.label} worst grade`}
                      value={row.worst}
                      onChange={(e) =>
                        update({ worst: e.target.value as HealthLetter })
                      }
                      style={{ ...fieldInputStyle, width: 70 }}
                    >
                      {LETTERS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
          );
        })}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
          }}
        >
          <input
            type="checkbox"
            checked={requireHealth}
            onChange={(e) => setRequireHealth(e.target.checked)}
          />
          Require health grades to exist (an ungraded health pillar blocks
          ready)
        </label>
      </fieldset>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : `Save ${seed?.label ?? activeType} config`}
        </PButton>
        <FormStatus state={state} successText="Multiplication config saved." />
      </div>
    </form>
  );
}

const noteStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  margin: 0,
  lineHeight: 1.55,
} as const;
