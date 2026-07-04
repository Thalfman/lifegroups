"use client";

import { useId, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminSetReadinessRule } from "@/app/(protected)/admin/settings/actions";
import {
  fieldInputClassName,
  fieldSelectClassName,
  formNoteClassName,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import type {
  ReadinessLetter,
  ReadinessRule,
} from "@/lib/admin/cell-readiness";

// Settings › Multiply readiness editor. Edits the single GLOBAL readiness rule —
// the seven pillars (Interest headcount, Capacity, Group Health, Shepherd Health,
// Members, Years as a group, Co-Shepherd tenure), each required-or-not with its
// threshold. A group type can override any pillar from the Multiply surface; with
// no override it inherits this rule. Save posts the rule as a JSON object string
// (`rule`) plus the `ministry_year`; the audited admin_set_readiness_rule RPC
// stays the authoritative gate.

const LETTERS: ReadinessLetter[] = ["A", "B", "C", "D", "F"];

const THRESHOLD_NOTE = "font-sans text-sm text-ink3";

/**
 * Whether every required count pillar carries a parseable whole number. The
 * rule posts as hidden JSON, so native `required` can't block submission —
 * without this gate an emptied field would silently coerce to 0 and save.
 * Exported for tests.
 */
export function readinessCountsValid(
  pairs: ReadonlyArray<readonly [required: boolean, rawMin: string]>
): boolean {
  return pairs.every(
    ([required, rawMin]) =>
      !required || Number.isInteger(Number.parseInt(rawMin, 10))
  );
}

export function MultiplyTriggerEditor({
  ministryYear,
  globalRule,
  storedRuleFellBack,
}: {
  ministryYear: number;
  globalRule: ReadinessRule;
  storedRuleFellBack: boolean;
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetReadinessRule
  );

  const [interestRequired, setInterestRequired] = useState(
    globalRule.interest.required
  );
  const [interestMin, setInterestMin] = useState(
    String(globalRule.interest.min)
  );
  const [capacityRequired, setCapacityRequired] = useState(
    globalRule.capacity.required
  );
  const [groupHealthRequired, setGroupHealthRequired] = useState(
    globalRule.groupHealth.required
  );
  const [groupHealthMin, setGroupHealthMin] = useState<ReadinessLetter>(
    globalRule.groupHealth.min
  );
  const [leaderHealthRequired, setLeaderHealthRequired] = useState(
    globalRule.leaderHealth.required
  );
  const [leaderHealthMin, setLeaderHealthMin] = useState<ReadinessLetter>(
    globalRule.leaderHealth.min
  );
  // Julian's three per-group multiplication criteria, folded into the rule as
  // count/years pillars (members ≥ N, group tenure ≥ N years, Co-Shepherd tenure
  // ≥ N years). Off by default; opting one in gates the per-type "Ready" badge.
  const [memberCountRequired, setMemberCountRequired] = useState(
    globalRule.memberCount.required
  );
  const [memberCountMin, setMemberCountMin] = useState(
    String(globalRule.memberCount.min)
  );
  const [groupTenureRequired, setGroupTenureRequired] = useState(
    globalRule.groupTenure.required
  );
  const [groupTenureMin, setGroupTenureMin] = useState(
    String(globalRule.groupTenure.min)
  );
  const [coShepherdTenureRequired, setCoShepherdTenureRequired] = useState(
    globalRule.coShepherdTenure.required
  );
  const [coShepherdTenureMin, setCoShepherdTenureMin] = useState(
    String(globalRule.coShepherdTenure.min)
  );

  const idBase = useId();

  // Gate Save on the required count pillars holding real numbers, so clearing
  // a field can't quietly save a 0 threshold. Non-required (disabled) inputs
  // may legitimately sit empty — the `|| 0` fallback below covers those.
  const countsValid = readinessCountsValid([
    [interestRequired, interestMin],
    [memberCountRequired, memberCountMin],
    [groupTenureRequired, groupTenureMin],
    [coShepherdTenureRequired, coShepherdTenureMin],
  ]);

  // Build the rule object posted as a JSON string. The validator re-decodes it
  // through the pure trust-boundary decoder, so a partial/odd value is normalized
  // server-side too.
  const rule: ReadinessRule = {
    interest: {
      required: interestRequired,
      min: Number.parseInt(interestMin, 10) || 0,
    },
    capacity: { required: capacityRequired },
    groupHealth: { required: groupHealthRequired, min: groupHealthMin },
    leaderHealth: { required: leaderHealthRequired, min: leaderHealthMin },
    memberCount: {
      required: memberCountRequired,
      min: Number.parseInt(memberCountMin, 10) || 0,
    },
    groupTenure: {
      required: groupTenureRequired,
      min: Number.parseInt(groupTenureMin, 10) || 0,
    },
    coShepherdTenure: {
      required: coShepherdTenureRequired,
      min: Number.parseInt(coShepherdTenureMin, 10) || 0,
    },
  };

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="ministry_year" value={ministryYear} />
      <input type="hidden" name="rule" value={JSON.stringify(rule)} />

      {storedRuleFellBack ? (
        <p
          role="alert"
          className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-sm text-clayDeep"
        >
          The stored readiness rule couldn&rsquo;t be read, so the built-in
          defaults are shown. Saving will overwrite the stored rule.
        </p>
      ) : null}

      <p className={formNoteClassName}>
        A group type is ready to multiply when every required pillar clears.
        Each pillar carries a value in its natural unit.
      </p>

      <PillarRow
        idBase={`${idBase}-interest`}
        title="Interest"
        required={interestRequired}
        onRequiredChange={setInterestRequired}
      >
        <label className={THRESHOLD_NOTE}>
          at least{" "}
          <input
            type="number"
            min={0}
            max={500}
            inputMode="numeric"
            value={interestMin}
            onChange={(e) => setInterestMin(e.target.value)}
            disabled={!interestRequired}
            className={`${fieldInputClassName} inline-block w-20`}
            aria-label="Minimum interested people"
          />{" "}
          interested people
        </label>
      </PillarRow>

      <PillarRow
        idBase={`${idBase}-capacity`}
        title="Capacity"
        required={capacityRequired}
        onRequiredChange={setCapacityRequired}
      >
        <span className={THRESHOLD_NOTE}>
          The group must be at or over its target size.
        </span>
      </PillarRow>

      <PillarRow
        idBase={`${idBase}-group-health`}
        title="Group Health"
        required={groupHealthRequired}
        onRequiredChange={setGroupHealthRequired}
      >
        <LetterField
          value={groupHealthMin}
          onChange={setGroupHealthMin}
          disabled={!groupHealthRequired}
          label="Minimum group health letter"
        />
      </PillarRow>

      <PillarRow
        idBase={`${idBase}-leader-health`}
        title="Shepherd Health"
        required={leaderHealthRequired}
        onRequiredChange={setLeaderHealthRequired}
      >
        <LetterField
          value={leaderHealthMin}
          onChange={setLeaderHealthMin}
          disabled={!leaderHealthRequired}
          label="Minimum Shepherd health letter"
        />
      </PillarRow>

      <PillarRow
        idBase={`${idBase}-member-count`}
        title="Members"
        required={memberCountRequired}
        onRequiredChange={setMemberCountRequired}
      >
        <CountField
          value={memberCountMin}
          onChange={setMemberCountMin}
          disabled={!memberCountRequired}
          unit="members"
          label="Minimum members"
        />
      </PillarRow>

      <PillarRow
        idBase={`${idBase}-group-tenure`}
        title="Years as a group"
        required={groupTenureRequired}
        onRequiredChange={setGroupTenureRequired}
      >
        <CountField
          value={groupTenureMin}
          onChange={setGroupTenureMin}
          disabled={!groupTenureRequired}
          unit="years"
          label="Minimum years as a group"
        />
      </PillarRow>

      <PillarRow
        idBase={`${idBase}-co-shepherd-tenure`}
        title="Co-Shepherd tenure"
        required={coShepherdTenureRequired}
        onRequiredChange={setCoShepherdTenureRequired}
      >
        <CountField
          value={coShepherdTenureMin}
          onChange={setCoShepherdTenureMin}
          disabled={!coShepherdTenureRequired}
          unit="years"
          label="Minimum Co-Shepherd years"
        />
      </PillarRow>

      <div className="flex items-center gap-2.5">
        <PButton
          type="submit"
          tone="terra"
          size="md"
          disabled={pending || !countsValid}
        >
          {pending ? "Saving…" : "Save readiness rule"}
        </PButton>
        <FormStatus state={state} successText="Readiness rule saved." />
      </div>
      {!countsValid ? (
        <p className={THRESHOLD_NOTE}>
          Enter a number for each required pillar to enable Save.
        </p>
      ) : null}
    </form>
  );
}

function PillarRow({
  idBase,
  title,
  required,
  onRequiredChange,
  children,
}: {
  idBase: string;
  title: string;
  required: boolean;
  onRequiredChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-line bg-surface px-3.5 py-3">
      <label className="flex items-center gap-2 font-sans text-base font-medium text-ink">
        <input
          id={idBase}
          type="checkbox"
          checked={required}
          onChange={(e) => onRequiredChange(e.target.checked)}
        />
        {title} required
      </label>
      <div className={required ? "" : "opacity-50"}>{children}</div>
    </div>
  );
}

function LetterField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: ReadinessLetter;
  onChange: (v: ReadinessLetter) => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <label className={THRESHOLD_NOTE}>
      at least{" "}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ReadinessLetter)}
        disabled={disabled}
        className={`${fieldSelectClassName} inline-block w-20`}
        aria-label={label}
      >
        {LETTERS.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

// A numeric threshold field shared by the three count/years pillars (members,
// group tenure, Co-Shepherd tenure) — mirrors the interest min field with its
// own unit label.
function CountField({
  value,
  onChange,
  disabled,
  unit,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  unit: string;
  label: string;
}) {
  return (
    <label className={THRESHOLD_NOTE}>
      at least{" "}
      <input
        type="number"
        min={0}
        max={500}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${fieldInputClassName} inline-block w-20`}
        aria-label={label}
      />{" "}
      {unit}
    </label>
  );
}
