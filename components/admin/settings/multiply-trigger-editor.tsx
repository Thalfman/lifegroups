"use client";

import { useState, type ReactNode } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  adminSetReadinessRule,
  adminSetAudienceReadinessRule,
  adminSetCellTriggerOverrides,
} from "@/app/(protected)/admin/settings/actions";
import { cn } from "@/lib/utils";
import {
  fieldInputClassName,
  fieldLabelClassName,
  fieldSelectClassName,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { AUDIENCE_CATEGORIES } from "@/lib/admin/audience";
import type { GroupAudienceCategory } from "@/types/enums";
import type {
  CellReadinessOverride,
  PerTypeReadinessRule,
  ReadinessLetter,
  ReadinessPillarKey,
  ReadinessRule,
} from "@/lib/admin/cell-readiness";
import {
  TRIGGER_TYPE_LABEL,
  buildPartial,
  decodeLevel,
  encodeLevel,
  pillarInheritedText,
  resolveParent,
  seedFieldsForLevel,
  type ParentRule,
  type PillarFields,
  type PillarToggles,
  type TriggerLevel,
} from "@/lib/admin/multiply-trigger";

// Settings › Multiply tiered trigger editor (#411 / ADR 0021). ONE grouped dropdown
// picks WHICH level of the three-tier cascade you're configuring — the Global
// default, a per-type (Audience) rule, or one active cell's overrides. The four
// pillars (Interest, Capacity, Group Health, Leader Health) then show, each either
// carrying its OWN value or INHERITING its parent (labelled by source) behind an
// Override toggle — you set only what differs; the rest flows down. Each level's
// Save posts ONLY that level via its matching audited RPC (the global rule RPC, the
// per-type RPC from #410, or the per-cell overrides RPC). Interest is a COUNT at
// every level — never a letter. This replaces both the old letter-grade per-type
// editor (deleted) and the Groups-panel readiness editor (removed); trigger config
// now lives solely here. The cascade arithmetic is the pure lib/admin/multiply-trigger.

const LETTERS: ReadinessLetter[] = ["A", "B", "C", "D", "F"];

// The quiet inline text beside a pillar's controls (units, inherited values).
const THRESHOLD_NOTE = "font-sans text-sm text-ink3";

// All three save actions share one signature (prev, formData) → ActionResult.
type LevelAction = typeof adminSetReadinessRule;

// One active cell's seed: its (type × category), display label, and the decoded
// current override (empty = inherits its parent for every pillar).
export type ReadinessCellSeed = {
  audienceCategory: GroupAudienceCategory;
  categoryId: string;
  label: string;
  override: CellReadinessOverride;
};

export function MultiplyTriggerEditor({
  ministryYear,
  globalRule,
  storedRuleFellBack = false,
  perType,
  cells,
}: {
  ministryYear: number;
  globalRule: ReadinessRule;
  // #473: true when a STORED global rule existed but couldn't be read, so
  // `globalRule` is the built-in fallback. Surfaces a calm notice — the admin
  // should know a custom trigger existed and that saving overwrites it. A
  // MISSING stored rule (fresh ministry) does not set this.
  storedRuleFellBack?: boolean;
  perType: Partial<Record<GroupAudienceCategory, PerTypeReadinessRule>>;
  cells: ReadinessCellSeed[];
}) {
  const [selected, setSelected] = useState<string>("global");

  // Resolve the dropdown value to a level. Fall back to Global if it points at a
  // cell that's no longer active (its category was archived between renders).
  const decoded = decodeLevel(selected) ?? { kind: "global" };
  const selectedCell =
    decoded.kind === "cell"
      ? (cells.find(
          (c) =>
            c.audienceCategory === decoded.audience &&
            c.categoryId === decoded.categoryId
        ) ?? null)
      : null;
  const level: TriggerLevel =
    decoded.kind === "cell" && !selectedCell ? { kind: "global" } : decoded;

  const cellOverride = selectedCell?.override ?? {};
  const parent = resolveParent(level, globalRule, perType);
  const seed = seedFieldsForLevel(level, globalRule, perType, cellOverride);

  // The level's stored value, mixed into the form key so the form re-seeds when a
  // save revalidates Settings and passes fresh props (a parent rule it inherits can
  // change underneath it). globalRule + perType cover every level's inheritance.
  const formKey = `${encodeLevel(level)}|${JSON.stringify(globalRule)}|${JSON.stringify(
    perType
  )}|${JSON.stringify(cellOverride)}`;

  // Per level: which audited RPC, which hidden fields, the payload field name, and
  // the copy. The Global level posts the full rule; per-type / per-cell post only
  // the overridden pillars (an empty `{}` clears the level back to its parent).
  let action: LevelAction;
  let hiddenFields: { name: string; value: string }[];
  let payloadName: string;
  let saveLabel: string;
  let successText: string;
  let note: ReactNode;

  if (level.kind === "global") {
    action = adminSetReadinessRule;
    hiddenFields = [{ name: "ministry_year", value: String(ministryYear) }];
    payloadName = "rule";
    saveLabel = "Save global default";
    successText = "Global trigger saved.";
    note = (
      <p className={formNoteClassName}>
        The ministry-wide default every type and group type inherits. A group
        type reads &ldquo;ready&rdquo; when every <em>required</em> pillar
        clears; pillars that aren&rsquo;t required are ignored. Ministry year{" "}
        {ministryYear}–{ministryYear + 1}.
      </p>
    );
  } else if (level.kind === "type") {
    action = adminSetAudienceReadinessRule;
    hiddenFields = [
      { name: "ministry_year", value: String(ministryYear) },
      { name: "audience_category", value: level.audience },
    ];
    payloadName = "rule";
    saveLabel = `Save ${TRIGGER_TYPE_LABEL[level.audience]} rule`;
    successText = "Per-type trigger saved.";
    note = (
      <p className={formNoteClassName}>
        Override only the pillars that differ for{" "}
        <strong>{TRIGGER_TYPE_LABEL[level.audience]}</strong> groups; the rest
        inherit the Global default. Turn every Override off to clear this type
        back to Global.
      </p>
    );
  } else {
    action = adminSetCellTriggerOverrides;
    hiddenFields = [
      { name: "category_id", value: level.categoryId },
      { name: "audience_category", value: level.audience },
    ];
    payloadName = "overrides";
    saveLabel = "Save overrides";
    successText = "Group type overrides saved.";
    note = (
      <p className={formNoteClassName}>
        Override only the pillars that differ for{" "}
        <strong>
          {TRIGGER_TYPE_LABEL[level.audience]} · {selectedCell?.label}
        </strong>
        ; the rest inherit {TRIGGER_TYPE_LABEL[level.audience]} / Global. Turn
        every Override off to clear this group type.
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      {storedRuleFellBack ? (
        // #473: calm, non-alarm styling for the stored-trigger-unreadable
        // notice — the editor still works; this only explains what it shows.
        <p className="m-0 rounded-sm border border-line bg-bg px-3.5 py-2.5 font-sans text-sm text-ink2">
          The stored multiplication trigger couldn&rsquo;t be read, so the
          built-in default is shown. Saving will overwrite what&rsquo;s stored.
        </p>
      ) : null}
      <div className="grid max-w-[420px] gap-1.5">
        <label htmlFor="multiply-trigger-level" className={fieldLabelClassName}>
          Configure trigger for
        </label>
        <select
          id="multiply-trigger-level"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className={fieldSelectClassName}
        >
          <option value="global">Global default</option>
          {/* #478: the per-type tier is named by the CONTEXT.md term for it —
              Audience — not the internal "by type" phrasing. */}
          <optgroup label="Audience">
            {AUDIENCE_CATEGORIES.map((a) => (
              <option key={a} value={`type:${a}`}>
                {TRIGGER_TYPE_LABEL[a]} (all categories)
              </option>
            ))}
          </optgroup>
          {cells.length > 0 ? (
            <optgroup label="By group type">
              {cells.map((c) => (
                <option
                  key={`${c.audienceCategory}:${c.categoryId}`}
                  value={`cell:${c.audienceCategory}:${c.categoryId}`}
                >
                  {TRIGGER_TYPE_LABEL[c.audienceCategory]} · {c.label}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>

      <LevelForm
        key={formKey}
        action={action}
        hiddenFields={hiddenFields}
        payloadName={payloadName}
        parent={parent}
        seedFields={seed.fields}
        seedToggles={seed.toggles}
        saveLabel={saveLabel}
        successText={successText}
        note={note}
      />
    </div>
  );
}

// One level's editing form. Holds the four pillars' fields + override toggles, posts
// the payload (full rule for Global; only the overridden pillars for per-type /
// per-cell) to the level's audited RPC. `parent` is null only for the Global level
// (its pillars are always set, no toggles); otherwise it carries each pillar's
// inherited value + source for the un-overridden rows.
function LevelForm({
  action,
  hiddenFields,
  payloadName,
  parent,
  seedFields,
  seedToggles,
  saveLabel,
  successText,
  note,
}: {
  action: LevelAction;
  hiddenFields: { name: string; value: string }[];
  payloadName: string;
  parent: ParentRule | null;
  seedFields: PillarFields;
  seedToggles: PillarToggles;
  saveLabel: string;
  successText: string;
  note: ReactNode;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(action);
  const [fields, setFields] = useState<PillarFields>(seedFields);
  const [toggles, setToggles] = useState<PillarToggles>(seedToggles);

  const update = (patch: Partial<PillarFields>) =>
    setFields((f) => ({ ...f, ...patch }));
  const setToggle = (pillar: keyof PillarToggles, on: boolean) =>
    setToggles((t) => ({ ...t, [pillar]: on }));

  const payloadJson = JSON.stringify(buildPartial(toggles, fields));

  return (
    <form action={formAction} className="grid gap-3.5">
      {hiddenFields.map((h) => (
        <input key={h.name} type="hidden" name={h.name} value={h.value} />
      ))}
      <input type="hidden" name={payloadName} value={payloadJson} />

      {note}

      <fieldset className="m-0 grid min-w-0 gap-2.5 rounded-sm border border-line px-3.5 py-3">
        <legend className="px-1.5 font-sans text-sm text-ink2">
          The four pillars
        </legend>
        <PillarControls
          fields={fields}
          update={update}
          parent={parent}
          toggles={toggles}
          setToggle={parent ? setToggle : undefined}
        />
      </fieldset>

      <div className="flex items-center gap-2.5">
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Saving…" : saveLabel}
        </PButton>
        <FormStatus state={state} successText={successText} />
      </div>
    </form>
  );
}

// #478: Interest is labelled as a people-count right on the pillar — it is a
// count (≥ N people) at every level, never a letter (CONTEXT.md, ADR 0021).
const PILLAR_META: { key: ReadinessPillarKey; label: string }[] = [
  { key: "interest", label: "Interest (people count)" },
  { key: "capacity", label: "Capacity" },
  { key: "groupHealth", label: "Group Health" },
  { key: "leaderHealth", label: "Leader Health" },
];

// The four pillar rows. With a `setToggle` (per-type / per-cell levels) each pillar
// gains an Override toggle: off → it shows the inherited value + source; on → its
// editable controls. Without one (the Global level) every pillar is always editable.
function PillarControls({
  fields,
  update,
  parent,
  toggles,
  setToggle,
}: {
  fields: PillarFields;
  update: (patch: Partial<PillarFields>) => void;
  parent: ParentRule | null;
  toggles: PillarToggles;
  setToggle?: (pillar: keyof PillarToggles, on: boolean) => void;
}) {
  return (
    <div className="grid gap-3">
      {PILLAR_META.map(({ key, label }) => {
        const overridden = setToggle ? toggles[key] : true;
        return (
          <div
            key={key}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex min-w-[150px] items-center gap-2">
              {setToggle ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={toggles[key]}
                    onChange={(e) => setToggle(key, e.target.checked)}
                    aria-label={`Override ${label}`}
                  />
                  <span className={cn(fieldLabelClassName, "mb-0")}>
                    {label}
                  </span>
                </label>
              ) : (
                <span className={cn(fieldLabelClassName, "mb-0")}>{label}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {overridden ? (
                <PillarInputs pillar={key} fields={fields} update={update} />
              ) : (
                <span className={cn(THRESHOLD_NOTE, "italic")}>
                  {pillarInheritedText(key, parent as ParentRule)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// One pillar's editable controls in its NATURAL unit: interest a Required toggle + a
// count (≥ N people), capacity a Required toggle only, the two health pillars a
// Required toggle + an A–F minimum.
function PillarInputs({
  pillar,
  fields,
  update,
}: {
  pillar: ReadinessPillarKey;
  fields: PillarFields;
  update: (patch: Partial<PillarFields>) => void;
}) {
  switch (pillar) {
    case "interest":
      return (
        <>
          <Required
            checked={fields.interestRequired}
            onChange={(v) => update({ interestRequired: v })}
            id="interest-req"
          />
          <span className={THRESHOLD_NOTE}>≥</span>
          <input
            aria-label="Interest minimum people"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={fields.interestMin}
            onChange={(e) => update({ interestMin: e.target.value })}
            className={cn(fieldInputClassName, "w-[72px] text-center")}
          />
          <span className={THRESHOLD_NOTE}>people</span>
        </>
      );
    case "capacity":
      return (
        <>
          <Required
            checked={fields.capacityRequired}
            onChange={(v) => update({ capacityRequired: v })}
            id="capacity-req"
          />
          <span className={THRESHOLD_NOTE}>no capacity issue</span>
        </>
      );
    case "groupHealth":
      return (
        <>
          <Required
            checked={fields.groupRequired}
            onChange={(v) => update({ groupRequired: v })}
            id="group-req"
          />
          <span className={THRESHOLD_NOTE}>≥</span>
          <LetterSelect
            ariaLabel="Group health minimum letter"
            value={fields.groupMin}
            onChange={(v) => update({ groupMin: v })}
          />
        </>
      );
    case "leaderHealth":
      return (
        <>
          <Required
            checked={fields.leaderRequired}
            onChange={(v) => update({ leaderRequired: v })}
            id="leader-req"
          />
          <span className={THRESHOLD_NOTE}>≥</span>
          <LetterSelect
            ariaLabel="Leader health minimum letter"
            value={fields.leaderMin}
            onChange={(v) => update({ leaderMin: v })}
          />
        </>
      );
  }
}

function Required({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-1.5 font-sans text-sm text-ink2"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Required
    </label>
  );
}

function LetterSelect({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string;
  value: ReadinessLetter;
  onChange: (v: ReadinessLetter) => void;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as ReadinessLetter)}
      className={cn(fieldSelectClassName, "w-[70px]")}
    >
      {LETTERS.map((l) => (
        <option key={l} value={l}>
          {l}
        </option>
      ))}
    </select>
  );
}
