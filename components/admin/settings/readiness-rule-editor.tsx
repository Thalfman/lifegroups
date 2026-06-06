"use client";

import { useState } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminSetReadinessRule,
  adminSetCellTriggerOverrides,
} from "@/app/(protected)/admin/settings/actions";
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
  CellReadinessOverride,
  ReadinessLetter,
  ReadinessRule,
} from "@/lib/admin/cell-readiness";

// Settings > Groups readiness-rule editor (#402 / PRD §2.4). Recast trigger: each
// pillar reads in its NATURAL unit (interest ≥ N people, capacity required/not,
// health ≥ A–F letter), configured once GLOBALLY with per-cell overrides. There
// is no `overflow` pillar. The top form sets the GLOBAL rule; each active cell
// below carries an override ROW where any pillar can either inherit the global
// rule or be overridden for that cell alone. Each save is its own audited RPC.

const LETTERS: ReadinessLetter[] = ["A", "B", "C", "D", "F"];

const TYPE_LABEL: Record<GroupAudienceCategory, string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

// One active cell's override seed: its (type × category), display label, and the
// decoded current override (empty = inherits the global rule for every pillar).
export type ReadinessCellSeed = {
  audienceCategory: GroupAudienceCategory;
  categoryId: string;
  label: string;
  override: CellReadinessOverride;
};

// The editable per-pillar shape the forms hold in state — the union of every
// pillar's controls (interest carries a count, health a letter; capacity neither).
type PillarFields = {
  interestRequired: boolean;
  interestMin: string; // kept as a string for the number input; parsed on submit
  capacityRequired: boolean;
  groupRequired: boolean;
  groupMin: ReadinessLetter;
  leaderRequired: boolean;
  leaderMin: ReadinessLetter;
};

function fieldsFromRule(rule: ReadinessRule): PillarFields {
  return {
    interestRequired: rule.interest.required,
    interestMin: String(rule.interest.min),
    capacityRequired: rule.capacity.required,
    groupRequired: rule.groupHealth.required,
    groupMin: rule.groupHealth.min,
    leaderRequired: rule.leaderHealth.required,
    leaderMin: rule.leaderHealth.min,
  };
}

// A non-negative integer from the interest-min input, flooring an empty/invalid
// entry to 0 (the validator + RPC re-guard, but keep the wire payload sane).
function parseMin(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Build the full rule jsonb from the editable fields (used for the GLOBAL rule).
function ruleFromFields(f: PillarFields): ReadinessRule {
  return {
    interest: { required: f.interestRequired, min: parseMin(f.interestMin) },
    capacity: { required: f.capacityRequired },
    groupHealth: { required: f.groupRequired, min: f.groupMin },
    leaderHealth: { required: f.leaderRequired, min: f.leaderMin },
  };
}

export function ReadinessRuleEditor({
  ministryYear,
  rule,
  cells,
}: {
  ministryYear: number;
  rule: ReadinessRule;
  cells: ReadinessCellSeed[];
}) {
  // A stable serialization of the saved global rule, mixed into each override
  // row's key so the rows re-seed their inherited values when the rule changes.
  const globalRuleKey = JSON.stringify(rule);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <GlobalRuleForm ministryYear={ministryYear} rule={rule} />

      <section style={{ display: "grid", gap: 12 }}>
        <h4 style={subheadStyle}>Per-cell overrides</h4>
        {cells.length === 0 ? (
          <p style={emptyNoteStyle}>
            No active cells yet. Apply a category to a top type above, then
            override the readiness rule for that cell here.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {cells.map((cell) => (
              <CellOverrideRow
                // The global rule is part of the key: a row INHERITS the global
                // rule for any pillar it doesn't override, and CellOverrideRow
                // seeds those inherited values into state once (useState). When the
                // saved global rule changes (a global save revalidates Settings and
                // passes a new rule), remounting via the key re-seeds the inherited
                // controls from the fresh rule, so an inherited pillar can't carry
                // a stale global threshold into a later override save.
                key={`${cell.audienceCategory}:${cell.categoryId}:${globalRuleKey}`}
                cell={cell}
                globalRule={rule}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// The GLOBAL rule form: every pillar is set (required-or-not + threshold). Posts
// the ministry year + the rule JSON to the audited RPC.
function GlobalRuleForm({
  ministryYear,
  rule,
}: {
  ministryYear: number;
  rule: ReadinessRule;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetReadinessRule
  );
  const [fields, setFields] = useState<PillarFields>(() =>
    fieldsFromRule(rule)
  );
  const update = (patch: Partial<PillarFields>) =>
    setFields((f) => ({ ...f, ...patch }));

  const ruleJson = JSON.stringify(ruleFromFields(fields));

  return (
    <form action={formAction} style={{ display: "grid", gap: 14 }}>
      <input type="hidden" name="ministry_year" value={ministryYear} />
      <input type="hidden" name="rule" value={ruleJson} />

      <p style={noteStyle}>
        The global readiness rule. A cell reads &ldquo;ready&rdquo; when every{" "}
        <em>required</em> pillar clears; pillars that aren&rsquo;t required are
        ignored. Ministry year {ministryYear}–{ministryYear + 1}.
      </p>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Global rule</legend>
        <PillarControls fields={fields} update={update} idPrefix="global" />
      </fieldset>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : "Save global rule"}
        </PButton>
        <FormStatus state={state} successText="Readiness rule saved." />
      </div>
    </form>
  );
}

// One active cell's override row. Per pillar, an "Override" checkbox: when off the
// pillar inherits the global rule; when on, the pillar's controls become editable
// and that pillar is included in the cell's overrides payload. Posts the cell's
// (type × category) + the overrides JSON (only overridden pillars). A separate
// "Inherit all" posts an empty object to clear every override.
function CellOverrideRow({
  cell,
  globalRule,
}: {
  cell: ReadinessCellSeed;
  globalRule: ReadinessRule;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetCellTriggerOverrides
  );

  // Which pillars are overridden for this cell (seeded from the stored override).
  const [over, setOver] = useState({
    interest: cell.override.interest !== undefined,
    capacity: cell.override.capacity !== undefined,
    groupHealth: cell.override.groupHealth !== undefined,
    leaderHealth: cell.override.leaderHealth !== undefined,
  });
  // The pillar VALUES — seeded from the override where present, else the global
  // rule (so flipping a pillar on starts from the inherited value).
  const [fields, setFields] = useState<PillarFields>(() =>
    fieldsFromRule({
      interest: cell.override.interest ?? globalRule.interest,
      capacity: cell.override.capacity ?? globalRule.capacity,
      groupHealth: cell.override.groupHealth ?? globalRule.groupHealth,
      leaderHealth: cell.override.leaderHealth ?? globalRule.leaderHealth,
    })
  );
  const update = (patch: Partial<PillarFields>) =>
    setFields((f) => ({ ...f, ...patch }));

  // Build the overrides payload from only the overridden pillars.
  const overrides: CellReadinessOverride = {};
  if (over.interest)
    overrides.interest = {
      required: fields.interestRequired,
      min: parseMin(fields.interestMin),
    };
  if (over.capacity) overrides.capacity = { required: fields.capacityRequired };
  if (over.groupHealth)
    overrides.groupHealth = {
      required: fields.groupRequired,
      min: fields.groupMin,
    };
  if (over.leaderHealth)
    overrides.leaderHealth = {
      required: fields.leaderRequired,
      min: fields.leaderMin,
    };

  const overrideCount = Object.keys(overrides).length;
  const overridesJson = JSON.stringify(overrides);

  return (
    <details style={detailsStyle}>
      <summary style={summaryStyle}>
        <span style={{ fontWeight: 600, color: P.ink }}>{cell.label}</span>
        <span style={{ color: P.ink3 }}>
          {" "}
          · {TYPE_LABEL[cell.audienceCategory]}
        </span>
        <span style={summaryCountStyle}>
          {overrideCount === 0
            ? "inherits global"
            : `${overrideCount} overridden`}
        </span>
      </summary>

      <form
        action={formAction}
        style={{ display: "grid", gap: 12, marginTop: 12 }}
      >
        <input type="hidden" name="category_id" value={cell.categoryId} />
        <input
          type="hidden"
          name="audience_category"
          value={cell.audienceCategory}
        />
        <input type="hidden" name="overrides" value={overridesJson} />

        <PillarControls
          fields={fields}
          update={update}
          idPrefix={`${cell.audienceCategory}-${cell.categoryId}`}
          override={over}
          setOverride={(pillar, on) => setOver((o) => ({ ...o, [pillar]: on }))}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <PButton type="submit" tone="terra" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save overrides"}
          </PButton>
          <FormStatus state={state} successText="Cell overrides saved." />
        </div>
      </form>
    </details>
  );
}

// The shared per-pillar controls. Without `override`/`setOverride` (the global
// form) every pillar is always editable. With them (a cell row) each pillar gains
// an "Override" checkbox that gates its controls; an un-overridden pillar inherits
// the global rule and its controls are disabled.
function PillarControls({
  fields,
  update,
  idPrefix,
  override,
  setOverride,
}: {
  fields: PillarFields;
  update: (patch: Partial<PillarFields>) => void;
  idPrefix: string;
  override?: {
    interest: boolean;
    capacity: boolean;
    groupHealth: boolean;
    leaderHealth: boolean;
  };
  setOverride?: (
    pillar: "interest" | "capacity" | "groupHealth" | "leaderHealth",
    on: boolean
  ) => void;
}) {
  // A pillar's controls are live when there's no override gate (global form) or
  // when its override is switched on (cell row).
  const live = (pillar: keyof NonNullable<typeof override>) =>
    override ? override[pillar] : true;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <PillarRow
        label="Interest"
        idPrefix={idPrefix}
        pillar="interest"
        override={override?.interest}
        setOverride={setOverride}
      >
        <Required
          checked={fields.interestRequired}
          disabled={!live("interest")}
          onChange={(v) => update({ interestRequired: v })}
          id={`${idPrefix}-interest-req`}
        />
        <span style={thresholdNoteStyle}>≥</span>
        <input
          aria-label="Interest minimum people"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={fields.interestMin}
          disabled={!live("interest")}
          onChange={(e) => update({ interestMin: e.target.value })}
          style={{ ...fieldInputStyle, width: 72, textAlign: "center" }}
        />
        <span style={thresholdNoteStyle}>people</span>
      </PillarRow>

      <PillarRow
        label="Capacity"
        idPrefix={idPrefix}
        pillar="capacity"
        override={override?.capacity}
        setOverride={setOverride}
      >
        <Required
          checked={fields.capacityRequired}
          disabled={!live("capacity")}
          onChange={(v) => update({ capacityRequired: v })}
          id={`${idPrefix}-capacity-req`}
        />
        <span style={thresholdNoteStyle}>no capacity issue</span>
      </PillarRow>

      <PillarRow
        label="Group Health"
        idPrefix={idPrefix}
        pillar="groupHealth"
        override={override?.groupHealth}
        setOverride={setOverride}
      >
        <Required
          checked={fields.groupRequired}
          disabled={!live("groupHealth")}
          onChange={(v) => update({ groupRequired: v })}
          id={`${idPrefix}-group-req`}
        />
        <span style={thresholdNoteStyle}>≥</span>
        <LetterSelect
          ariaLabel="Group health minimum letter"
          value={fields.groupMin}
          disabled={!live("groupHealth")}
          onChange={(v) => update({ groupMin: v })}
        />
      </PillarRow>

      <PillarRow
        label="Leader Health"
        idPrefix={idPrefix}
        pillar="leaderHealth"
        override={override?.leaderHealth}
        setOverride={setOverride}
      >
        <Required
          checked={fields.leaderRequired}
          disabled={!live("leaderHealth")}
          onChange={(v) => update({ leaderRequired: v })}
          id={`${idPrefix}-leader-req`}
        />
        <span style={thresholdNoteStyle}>≥</span>
        <LetterSelect
          ariaLabel="Leader health minimum letter"
          value={fields.leaderMin}
          disabled={!live("leaderHealth")}
          onChange={(v) => update({ leaderMin: v })}
        />
      </PillarRow>
    </div>
  );
}

function PillarRow({
  label,
  idPrefix,
  pillar,
  override,
  setOverride,
  children,
}: {
  label: string;
  idPrefix: string;
  pillar: "interest" | "capacity" | "groupHealth" | "leaderHealth";
  override?: boolean;
  setOverride?: (
    pillar: "interest" | "capacity" | "groupHealth" | "leaderHealth",
    on: boolean
  ) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={pillarRowStyle}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 150 }}
      >
        {setOverride ? (
          <label style={overrideToggleStyle}>
            <input
              type="checkbox"
              checked={override ?? false}
              onChange={(e) => setOverride(pillar, e.target.checked)}
              aria-label={`Override ${label} for this cell`}
            />
            <span style={fieldLabelStyle}>{label}</span>
          </label>
        ) : (
          <span style={fieldLabelStyle} id={`${idPrefix}-${pillar}-label`}>
            {label}
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Required({
  checked,
  disabled,
  onChange,
  id,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <label htmlFor={id} style={requiredLabelStyle}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      Required
    </label>
  );
}

function LetterSelect({
  ariaLabel,
  value,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  value: ReadinessLetter;
  disabled: boolean;
  onChange: (v: ReadinessLetter) => void;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as ReadinessLetter)}
      style={{ ...fieldInputStyle, width: 70 }}
    >
      {LETTERS.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}

const noteStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  margin: 0,
  lineHeight: 1.55,
} as const;

const emptyNoteStyle = {
  ...noteStyle,
  color: P.ink3,
  fontStyle: "italic" as const,
} as const;

const subheadStyle = {
  fontFamily: fontBody,
  fontSize: 14,
  fontWeight: 600,
  color: P.ink,
  margin: 0,
} as const;

const fieldsetStyle = {
  border: `1px solid ${P.line}`,
  borderRadius: 10,
  padding: "12px 14px",
  display: "grid",
  gap: 10,
} as const;

const legendStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
  padding: "0 6px",
} as const;

const pillarRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap" as const,
} as const;

const requiredLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink2,
} as const;

const overrideToggleStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
} as const;

const thresholdNoteStyle = {
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink3,
} as const;

const detailsStyle = {
  border: `1px solid ${P.line}`,
  borderRadius: 10,
  padding: "10px 14px",
  background: P.bg,
} as const;

const summaryStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  flexWrap: "wrap" as const,
  fontFamily: fontBody,
  fontSize: 13,
  cursor: "pointer",
} as const;

const summaryCountStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink3,
  marginLeft: "auto",
} as const;
