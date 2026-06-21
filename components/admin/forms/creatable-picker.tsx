"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
  fieldErrorClassName as FIELD_ERROR,
  fieldHintClassName as HINT,
} from "@/components/admin/forms/field-styles";

// A reusable "pick an existing value OR add a new one in place" control (#776
// Phase 0, generalized from GroupTypePicker / the prospect form's inline add).
// It is an existing-values <select> PLUS a trailing "＋ Add new…" affordance:
// choosing it reveals a labelled text box, and saving runs the caller's
// `onCreate` (an existing audited server action — this control adds no write
// path), then appends + selects the value.
//
// The picker posts the chosen value through a controlled <select name>, so the
// enclosing form submits it like any field. It listens for the form's native
// `reset` event (fired by useActionForm's resetOnSuccess) and clears itself, so
// after a successful submit it returns to the "—" no-selection state — matching
// the uncontrolled select it replaces.

const ADD_NEW_VALUE = "__creatable_add_new__";

// The caller adapts its audited action to this shape. `value` lets the action
// return canonical casing to select instead of the typed text.
export type CreatableCreateResult =
  | { ok: true; value?: string }
  | { ok: false; error: string };

export function CreatablePicker({
  options = [],
  onCreate,
  name,
  id,
  label,
  initialValue,
  addOptionLabel = "＋ Add new…",
  newItemLabel = "New item",
  placeholder,
  addHint,
  maxLength = 80,
  emptyError = "Enter a value.",
}: {
  options?: readonly string[];
  onCreate: (value: string) => Promise<CreatableCreateResult>;
  name: string;
  id: string;
  label: string;
  // The value to preselect on mount (the edit form's current group type). When
  // it's not in `options` (a free-text value, or one later removed from the
  // admin list) it's seeded into `extras` so it stays selectable — and the form
  // reset returns here, not to "—", so saving an unrelated edit can't clear it.
  initialValue?: string;
  addOptionLabel?: string;
  newItemLabel?: string;
  placeholder?: string;
  addHint?: string;
  maxLength?: number;
  emptyError?: string;
}) {
  const seedValue = initialValue ?? "";
  // Values appended this session (one the user just added) layer on top of the
  // server-provided list until the next server read carries them natively. Seed
  // with the initial value when it isn't already an EXACT option — a value that
  // differs only by case (stored `men` vs option `Men`) must stay seeded, or the
  // controlled <select> would have no matching option and an unrelated save could
  // submit it blank, clearing the field (the old edit form kept such values).
  const [extras, setExtras] = useState<string[]>(
    seedValue.length > 0 && !options.includes(seedValue) ? [seedValue] : []
  );
  const [value, setValue] = useState(seedValue);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);
  const newItemRef = useRef<HTMLInputElement>(null);

  // Exact (case-sensitive) dedup against options: a seeded value that differs
  // only by case from an option is kept as its own selectable option so the
  // controlled select always has a match. The add-new flow has its own
  // case-insensitive guard (`addItem`'s `existing` check), so this never shows a
  // duplicate `Men`/`men` the user typed.
  const values = [...options, ...extras.filter((t) => !options.includes(t))];

  // Clear back to no-selection when the enclosing form resets on success.
  useEffect(() => {
    const form = selectRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setValue(seedValue);
      setAdding(false);
      setNewItem("");
      setError(undefined);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [seedValue]);

  // Move focus to the revealed box when the user opts to add a new value.
  useEffect(() => {
    if (adding) newItemRef.current?.focus();
  }, [adding]);

  function onSelectChange(next: string) {
    if (next === ADD_NEW_VALUE) {
      // Reveal the add box; keep the posted value unchanged (the controlled
      // select snaps back to `value`, so the sentinel is never submitted).
      setAdding(true);
      return;
    }
    setAdding(false);
    setValue(next);
  }

  function addItem() {
    const trimmed = newItem.trim();
    if (trimmed.length === 0) {
      setError(emptyError);
      return;
    }
    if (trimmed.length > maxLength) {
      setError(`Keep it to ${maxLength} characters or fewer.`);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await onCreate(trimmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Reuse the canonical casing already in the list if it differs only by
      // case (the action is a case-insensitive no-op in that case), else the
      // action's returned value, else the typed text.
      const existing = values.find(
        (t) => t.toLowerCase() === trimmed.toLowerCase()
      );
      const resolved = existing ?? result.value ?? trimmed;
      if (!existing && !values.includes(resolved)) {
        setExtras((prev) => [...prev, resolved]);
      }
      setValue(resolved);
      setAdding(false);
      setNewItem("");
    });
  }

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <select
        ref={selectRef}
        id={id}
        name={name}
        value={value}
        onChange={(e) => onSelectChange(e.target.value)}
        className={INPUT}
      >
        <option value="">—</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
        <option value={ADD_NEW_VALUE}>{addOptionLabel}</option>
      </select>

      {adding ? (
        <div className="mt-2 grid gap-1.5">
          <label htmlFor={`${id}-new`} className={LABEL}>
            {newItemLabel}
          </label>
          <div className="flex items-start gap-2">
            <input
              ref={newItemRef}
              id={`${id}-new`}
              type="text"
              value={newItem}
              maxLength={maxLength}
              onChange={(e) => {
                setNewItem(e.target.value);
                if (error) setError(undefined);
              }}
              onKeyDown={(e) => {
                // Enter adds the value without submitting the surrounding form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
              autoComplete="off"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={`${id}-new-error`}
              className={INPUT}
              placeholder={placeholder}
            />
            <PButton
              type="button"
              tone="terra"
              size="md"
              onClick={addItem}
              disabled={pending || newItem.trim().length === 0}
            >
              {pending ? "Adding…" : "Add"}
            </PButton>
          </div>
          <p
            id={`${id}-new-error`}
            role="alert"
            className={FIELD_ERROR}
            hidden={!error}
          >
            {error}
          </p>
          {addHint ? <p className={HINT}>{addHint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
