"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminAddGroupType } from "@/app/(protected)/admin/plan/actions";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
  fieldErrorClassName as FIELD_ERROR,
  fieldHintClassName as HINT,
} from "@/components/admin/forms/field-styles";

// Reusable picker for a free-text group type (#747). It is the existing-types
// dropdown PLUS a trailing "＋ Add new type…" affordance: choosing it reveals a
// labelled text box, and saving a new value appends it to the canonical
// group_types list (the idempotent admin_add_group_type RPC) and selects it.
//
// The picker posts the chosen value through a controlled <select name>, so the
// enclosing form submits it like any field. It listens for the form's native
// `reset` event (fired by useActionForm's resetOnSuccess) and clears itself, so
// after a successful submit it returns to the "—" no-selection state — matching
// the uncontrolled select it replaces.

const ADD_NEW_VALUE = "__add_new_group_type__";
const MAX_TYPE_NAME_LENGTH = 80;

export function GroupTypePicker({
  groupTypes = [],
  name = "desired_group_type",
  id = "prospect-desired_group_type",
  label = "Desired group type (optional)",
}: {
  groupTypes?: readonly string[];
  name?: string;
  id?: string;
  label?: string;
}) {
  // Types appended this session (a new type the admin just added) layer on top of
  // the server-provided list until the next server read carries them natively.
  const [extraTypes, setExtraTypes] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);
  const newTypeRef = useRef<HTMLInputElement>(null);

  const types = [
    ...groupTypes,
    ...extraTypes.filter(
      (t) => !groupTypes.some((g) => g.toLowerCase() === t.toLowerCase())
    ),
  ];

  // Clear back to no-selection when the enclosing form resets on success.
  useEffect(() => {
    const form = selectRef.current?.form;
    if (!form) return;
    const onReset = () => {
      setValue("");
      setAdding(false);
      setNewType("");
      setError(undefined);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  // Move focus to the revealed box when the admin opts to add a new type.
  useEffect(() => {
    if (adding) newTypeRef.current?.focus();
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

  function addType() {
    const trimmed = newType.trim();
    if (trimmed.length === 0) {
      setError("Enter a group type.");
      return;
    }
    if (trimmed.length > MAX_TYPE_NAME_LENGTH) {
      setError(`Keep it to ${MAX_TYPE_NAME_LENGTH} characters or fewer.`);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("group_type", trimmed);
      const result = await adminAddGroupType(undefined, formData);
      if (!result.ok) {
        setError(result.errors[0] ?? "Couldn't add that type. Try again.");
        return;
      }
      // Reuse the canonical casing already in the list if it differs only by
      // case (the RPC is a case-insensitive no-op in that case).
      const existing = types.find(
        (t) => t.toLowerCase() === trimmed.toLowerCase()
      );
      const resolved = existing ?? trimmed;
      if (!existing) setExtraTypes((prev) => [...prev, trimmed]);
      setValue(resolved);
      setAdding(false);
      setNewType("");
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
        {types.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
        <option value={ADD_NEW_VALUE}>＋ Add new type…</option>
      </select>

      {adding ? (
        <div className="mt-2 grid gap-1.5">
          <label htmlFor={`${id}-new`} className={LABEL}>
            New group type
          </label>
          <div className="flex items-start gap-2">
            <input
              ref={newTypeRef}
              id={`${id}-new`}
              type="text"
              value={newType}
              maxLength={MAX_TYPE_NAME_LENGTH}
              onChange={(e) => {
                setNewType(e.target.value);
                if (error) setError(undefined);
              }}
              onKeyDown={(e) => {
                // Enter adds the type without submitting the surrounding form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  addType();
                }
              }}
              autoComplete="off"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={`${id}-new-error`}
              className={INPUT}
              placeholder="e.g. Young Families"
            />
            <PButton
              type="button"
              tone="terra"
              size="md"
              onClick={addType}
              disabled={pending || newType.trim().length === 0}
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
          <p className={HINT}>
            Adds the type to the shared list so it&apos;s available everywhere.
          </p>
        </div>
      ) : null}
    </div>
  );
}
