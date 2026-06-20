"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { adminAddGroupType } from "@/app/(protected)/admin/settings/actions";
import {
  fieldLabelClassName as LABEL,
  fieldSelectClassName as SELECT,
  fieldInputBaseClassName as INPUT,
  fieldErrorClassName as FIELD_ERROR,
  fieldHintClassName as HINT,
} from "@/components/admin/forms/field-styles";

// #747: a reusable Group-type chooser — the admin-managed list of free-text
// types plus a trailing "＋ Add new type…" option that reveals an inline text
// box, so Julian is never blocked when the type he wants isn't in the list yet.
// The enclosing <form> receives the resolved value through a hidden input (the
// sentinel itself is never submitted). On adding, it appends the type to the
// master list via the idempotent admin_add_group_type RPC and selects it.
//
// Optional / "—" no-selection is allowed: a desired type is free text that may
// validly be unset (or a value not in the master list — `defaultValue` is always
// offered as an option so a pre-selected off-list value still shows).

const ADD_NEW_SENTINEL = "__lg_add_new_type__";
const MAX_TYPE_NAME_LENGTH = 80;

export function GroupTypePicker({
  id,
  name = "desired_group_type",
  label,
  groupTypes,
  defaultValue,
}: {
  id: string;
  name?: string;
  label: string;
  groupTypes: readonly string[];
  defaultValue?: string;
}) {
  // Local option list so a freshly-added type is selectable immediately, before
  // the server revalidation re-supplies the canonical list as a fresh prop. Seed
  // with any pre-selected off-list value so it renders as the current selection.
  const [options, setOptions] = useState<string[]>(() => {
    const base = [...groupTypes];
    if (
      defaultValue &&
      !base.some((t) => t.toLowerCase() === defaultValue.toLowerCase())
    ) {
      base.push(defaultValue);
    }
    return base;
  });
  // The resolved value submitted with the enclosing form. "" = not set ("—").
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const errorId = `${id}-error`;

  function onSelectChange(value: string) {
    if (value === ADD_NEW_SENTINEL) {
      setAdding(true);
      setError(undefined);
      return;
    }
    setAdding(false);
    setNewType("");
    setError(undefined);
    setSelected(value);
  }

  async function onAdd() {
    const trimmed = newType.trim();
    if (trimmed.length === 0) {
      setError("Enter a group type.");
      return;
    }
    if (trimmed.length > MAX_TYPE_NAME_LENGTH) {
      setError(
        `A group type must be ${MAX_TYPE_NAME_LENGTH} characters or fewer.`
      );
      return;
    }
    setPending(true);
    setError(undefined);
    const fd = new FormData();
    fd.set("group_type", trimmed);
    const result = await adminAddGroupType(undefined, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.errors.join(" "));
      return;
    }
    // Append to the local option list (case-insensitive) and select it.
    setOptions((prev) =>
      prev.some((t) => t.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, trimmed]
    );
    setSelected(trimmed);
    setAdding(false);
    setNewType("");
  }

  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {/* The resolved value the enclosing form submits; the "Add new type…"
          sentinel is never submitted as a value. */}
      <input type="hidden" name={name} value={selected} />
      <select
        id={id}
        value={adding ? ADD_NEW_SENTINEL : selected}
        onChange={(e) => onSelectChange(e.target.value)}
        className={SELECT}
      >
        <option value="">—</option>
        {options.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
        <option value={ADD_NEW_SENTINEL}>＋ Add new type…</option>
      </select>
      {adding ? (
        <div className="mt-2 grid gap-2">
          <label htmlFor={`${id}-new`} className={LABEL}>
            New group type
          </label>
          <div className="flex items-start gap-2">
            <input
              id={`${id}-new`}
              type="text"
              value={newType}
              maxLength={MAX_TYPE_NAME_LENGTH}
              onChange={(e) => {
                setNewType(e.target.value);
                if (error) setError(undefined);
              }}
              className={INPUT}
              placeholder="e.g. Mixed – Young Families"
              autoComplete="off"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={errorId}
            />
            <Button
              type="button"
              variant="subtle"
              size="sm"
              onClick={onAdd}
              disabled={pending}
            >
              {pending ? "Adding…" : "Add"}
            </Button>
          </div>
          <p className={HINT}>
            Adds the type to your master list so it&rsquo;s reusable everywhere.
          </p>
        </div>
      ) : null}
      {/* Stable live region: kept mounted (hidden when clear) so role="alert"
          announces the message when validation populates it. */}
      <p id={errorId} role="alert" className={FIELD_ERROR} hidden={!error}>
        {error}
      </p>
    </div>
  );
}
