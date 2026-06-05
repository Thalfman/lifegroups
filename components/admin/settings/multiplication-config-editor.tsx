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
  FedCapacity,
  HealthLetter,
  PillarThresholds,
  TriggerRubric,
} from "@/lib/admin/multiplication-pillars";

// Settings Multiplication-config editor (#380). Lets Julian feed the per-type
// Capacity (the Ministry-Admin number that drives the Capacity pillar + the
// individual-group full-count flag) and configure the trigger rubric (the
// per-pillar minimum letters that produce the "ready to multiply this type"
// signal). One type is edited at a time; the editor posts the group_type,
// ministry_year, and the three JSON payloads the audited RPC persists.

const LETTERS: HealthLetter[] = ["A", "B", "C", "D", "F"];
const TRIGGER_PILLARS: {
  key: "capacity" | "interest" | "groupHealth" | "leaderHealth";
  label: string;
}[] = [
  { key: "capacity", label: "Capacity" },
  { key: "interest", label: "Interest" },
  { key: "groupHealth", label: "Group Health" },
  { key: "leaderHealth", label: "Leader Health" },
];

export type MultiplicationConfigSeed = {
  type: GroupAudienceCategory;
  label: string;
  thresholds: PillarThresholds;
  trigger: TriggerRubric;
  fedCapacity: FedCapacity;
};

// "off" means the pillar is not part of the trigger; any other value is its
// minimum letter.
type TriggerSelection = Record<string, HealthLetter | "off">;

function seedTriggerSelection(trigger: TriggerRubric): TriggerSelection {
  const out: TriggerSelection = {};
  for (const p of TRIGGER_PILLARS) {
    out[p.key] = trigger.minimums[p.key] ?? "off";
  }
  return out;
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
    seedTriggerSelection(seed?.trigger ?? { minimums: {} })
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
    setTriggerSel(seedTriggerSelection(s?.trigger ?? { minimums: {} }));
  };

  // The thresholds aren't edited here (the numeric pillar bands keep their seeded
  // / built-in values); carry them through unchanged so a save doesn't reset
  // them. Capacity + trigger are what Julian sets on this surface.
  const thresholdsJson = JSON.stringify(seed?.thresholds ?? {});

  const minimums: Record<string, HealthLetter> = {};
  for (const p of TRIGGER_PILLARS) {
    const v = triggerSel[p.key];
    if (v !== "off") minimums[p.key] = v;
  }
  const triggerJson = JSON.stringify({
    minimums,
    requireHealthGrades: requireHealth,
  });

  const headroomNum = headroom.trim() === "" ? null : Number(headroom);
  const fedCapacityJson = JSON.stringify({
    headroom:
      headroomNum != null && Number.isFinite(headroomNum) ? headroomNum : null,
    fullGroupCount: Number(fullGroupCount) || 0,
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
        The full-group count raises an individual &ldquo;multiply this
        one&rdquo; flag. The trigger sets the minimum pillar grades a type must
        clear to be ready. Ministry year {ministryYear}–{ministryYear + 1}.
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
          Trigger — minimum grade each pillar must clear
        </legend>
        {TRIGGER_PILLARS.map((p) => (
          <div
            key={p.key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <label htmlFor={`mc-trig-${p.key}`} style={fieldLabelStyle}>
              {p.label}
            </label>
            <select
              id={`mc-trig-${p.key}`}
              value={triggerSel[p.key]}
              onChange={(e) =>
                setTriggerSel((s) => ({
                  ...s,
                  [p.key]: e.target.value as HealthLetter | "off",
                }))
              }
              style={{ ...fieldInputStyle, width: 140 }}
            >
              <option value="off">Not required</option>
              {LETTERS.map((l) => (
                <option key={l} value={l}>
                  At least {l}
                </option>
              ))}
            </select>
          </div>
        ))}
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
