"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PButton } from "@/components/pastoral/button";
import { useValueChange } from "@/lib/hooks/use-value-change";
import { adminCreateProspect } from "@/app/(protected)/admin/plan/actions";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { FULL_NAME_REQUIRED_MESSAGE } from "@/lib/admin/validation/prospect-form-client";
import type { GroupAudienceCategory } from "@/types/enums";
import type { CategoryOptionsByAudience } from "@/lib/supabase/group-categories-reads";
import {
  fieldLabelClassName as LABEL,
  fieldInputBaseClassName as INPUT,
} from "@/components/admin/forms/field-styles";

// The three top types, in board order, with their display labels.
const TOP_TYPES: { value: GroupAudienceCategory; label: string }[] = [
  { value: "men", label: "Men's" },
  { value: "women", label: "Women's" },
  { value: "mixed", label: "Mixed" },
];

// The interest cell select carries a single value encoding both halves of the
// cell — "<audience>:<categoryId>" — so the two dropdowns collapse into ONE box
// (Julian's review). The category id is a UUID (no colons), so a plain split is
// safe; "" means no desired cell.
function splitCell(value: string): {
  audience: GroupAudienceCategory | "";
  categoryId: string;
} {
  if (value === "") return { audience: "", categoryId: "" };
  const idx = value.indexOf(":");
  const audience = value.slice(0, idx) as GroupAudienceCategory;
  return { audience, categoryId: value.slice(idx + 1) };
}

// The in-progress prospect, stashed in sessionStorage when the admin steps over
// to Settings to add a group type, then restored on return so they land back
// "where they were" (the prospect isn't saved yet, so a normal navigation would
// otherwise lose it).
const DRAFT_KEY = "lg:plan:prospect-draft";

type ProspectDraft = {
  fullName: string;
  email: string;
  phone: string;
  cell: string;
};

// Add a Prospect to the funnel (acceptance #2). A new Prospect always lands in
// Interested with no group — the state machine moves them onward from there.
// #399 captured the DESIRED cell as two dependent dropdowns (top type + category);
// Julian's review collapses them into ONE group-type box listing the active cells,
// plus a "+ Add a group type" shortcut that round-trips to Settings › Groups (where
// group types are managed free-text) and brings the half-filled prospect back.
export function ProspectCreateForm({
  categoryOptionsByAudience,
}: {
  categoryOptionsByAudience: CategoryOptionsByAudience;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateProspect,
    { resetOnSuccess: true }
  );

  // The identity fields and the chosen cell are controlled so they can be
  // restored from a saved draft after the Settings round-trip and cleared on a
  // successful create.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cell, setCell] = useState("");

  // Native `required` on the Full name field blocks an empty submit and moves
  // focus, but that alone is too quiet (no app-level message). We surface a
  // visible, accessible message via the field's `onInvalid` (which fires from
  // the native constraint pass) without taking over submission — native still
  // gates the empty case, we only upgrade the messaging.
  const [fullNameError, setFullNameError] = useState<string | undefined>(
    undefined
  );

  // The "Prospect added." confirmation auto-dismisses. Otherwise it lingered as
  // a stale message at the top of the board after a later action on a different
  // card (e.g. moving a prospect), since this create form is a separate
  // persistent client component whose useActionState success state isn't cleared
  // by the board's revalidation.
  const [showSuccess, setShowSuccess] = useState(false);

  // The currently-valid cell values ("<audience>:<categoryId>"), so a restored
  // draft can't resurrect a group type that has since been removed (or an old
  // draft from a different ministry) — which would submit a stale audience/
  // category pair and trip the RPC's `inactive_cell` guard.
  const validCellValues = useMemo(() => {
    const values = new Set<string>();
    for (const t of TOP_TYPES) {
      for (const opt of categoryOptionsByAudience[t.value]) {
        values.add(`${t.value}:${opt.id}`);
      }
    }
    return values;
  }, [categoryOptionsByAudience]);

  // Restore a draft left when the admin stepped over to Settings to add a group.
  // Runs once on mount; the draft is consumed (removed) so a later fresh open
  // starts blank. Guarded for SSR / private-mode sessionStorage failures.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(DRAFT_KEY);
      const draft = JSON.parse(raw) as Partial<ProspectDraft>;
      /* eslint-disable react-hooks/set-state-in-effect --
         Client-only one-shot read of sessionStorage to restore the in-progress
         prospect after the Settings round-trip. The draft cannot be known until
         mount, and a lazy initializer would read sessionStorage during SSR (where
         it is undefined) and cause a hydration mismatch — so deferring the read to
         a mount effect is the hydration-safe pattern, not the cascading-render
         smell the rule targets. */
      if (typeof draft.fullName === "string") setFullName(draft.fullName);
      if (typeof draft.email === "string") setEmail(draft.email);
      if (typeof draft.phone === "string") setPhone(draft.phone);
      // Only restore the cell if it still maps to an active group type; otherwise
      // drop it so the box reads as no selection rather than submitting a stale
      // pair.
      if (typeof draft.cell === "string" && validCellValues.has(draft.cell)) {
        setCell(draft.cell);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // A blocked or malformed sessionStorage just means no draft to restore.
    }
  }, [validCellValues]);

  // useActionForm resets the <form> element on success, but the fields are
  // controlled by React state, so reset them too. Otherwise the next prospect
  // (entered with only a name) would resubmit the previous prospect's desired
  // cell and be miscounted into it. Depends on `state` (a fresh object each
  // submit) so a back-to-back success clears again, mirroring the group forms'
  // reset effect.
  useValueChange(state, (next) => {
    if (!next?.ok) return;
    setFullName("");
    setEmail("");
    setPhone("");
    setCell("");
    setFullNameError(undefined);
    setShowSuccess(true);
  });

  // Auto-dismiss the success flash after 5s. Keyed on the action result so a
  // back-to-back success restarts the window; the only setState here lives in
  // the timer callback, not the effect body.
  useEffect(() => {
    if (!state?.ok) return;
    const timer = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [state]);

  // The active cells, grouped by top type for the one combined select's
  // <optgroup>s. A top type with no active categories is omitted so the box never
  // shows an empty group.
  const cellGroups = TOP_TYPES.map((t) => ({
    ...t,
    options: categoryOptionsByAudience[t.value],
  })).filter((g) => g.options.length > 0);
  const hasAnyCell = cellGroups.length > 0;

  const { audience, categoryId } = splitCell(cell);
  const canSubmit = fullName.trim().length > 0;

  // Stash the in-progress prospect just before navigating to Settings › Groups,
  // so the return banner there brings the half-filled prospect back. The Link's
  // navigation proceeds after this runs.
  const stashDraft = () => {
    try {
      const draft: ProspectDraft = { fullName, email, phone, cell };
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // If sessionStorage is unavailable the round-trip still works; only the
      // half-filled prospect won't be restored.
    }
  };

  return (
    <form ref={formRef} action={formAction} className="grid gap-3">
      <p className="m-0 mb-3 font-sans text-sm leading-normal text-ink2">
        Only the name is required. New prospects start as <em>Interested</em>;
        move them to Matched once you have a group.
      </p>
      {/* The desired cell posts as two hidden fields derived from the one select,
          so the server action / validator / RPC are unchanged (both travel
          together — a named cell needs a top type AND a category). */}
      <input type="hidden" name="desired_audience_category" value={audience} />
      <input type="hidden" name="desired_category_id" value={categoryId} />
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3.5">
        <div>
          <label htmlFor="prospect-full_name" className={LABEL}>
            Full name
          </label>
          <input
            id="prospect-full_name"
            name="full_name"
            type="text"
            required
            value={fullName}
            aria-required="true"
            aria-invalid={fullNameError ? "true" : undefined}
            aria-describedby="prospect-full_name-error"
            onInvalid={(e) => {
              // Suppress the native bubble and show our own accessible message;
              // the field stays invalid, so native still blocks the submit.
              e.preventDefault();
              setFullNameError(FULL_NAME_REQUIRED_MESSAGE);
            }}
            onInput={() => {
              if (fullNameError) setFullNameError(undefined);
            }}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="off"
            className={INPUT}
            placeholder="Avery Bennett"
          />
          {/* Stable live region: kept mounted (hidden when clear) so the
              aria-describedby target is constant and role="alert" announces the
              message when validation populates it. */}
          <p
            id="prospect-full_name-error"
            role="alert"
            className="mb-0 mt-1.5 font-sans text-sm text-rose"
            hidden={!fullNameError}
          >
            {fullNameError}
          </p>
        </div>
        <div>
          <label htmlFor="prospect-email" className={LABEL}>
            Email (optional)
          </label>
          <input
            id="prospect-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            className={INPUT}
            placeholder="avery@example.com"
          />
        </div>
        <div>
          <label htmlFor="prospect-phone" className={LABEL}>
            Phone (optional)
          </label>
          <input
            id="prospect-phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="off"
            className={INPUT}
            placeholder="(555) 555-0100"
          />
        </div>
        <div>
          <label htmlFor="prospect-desired_cell" className={LABEL}>
            Interested in: group type (optional)
          </label>
          <select
            id="prospect-desired_cell"
            value={cell}
            onChange={(e) => setCell(e.target.value)}
            disabled={!hasAnyCell}
            className={INPUT}
          >
            <option value="">
              {hasAnyCell ? "— None —" : "No group types yet"}
            </option>
            {cellGroups.map((group) => (
              <optgroup key={group.value} label={group.label}>
                {group.options.map((opt) => (
                  <option key={opt.id} value={`${group.value}:${opt.id}`}>
                    {group.label} · {opt.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {/* Free-text group types live in Settings; this shortcut keeps adding
              one a click away and brings the half-filled prospect back. */}
          <Link
            href="/admin/settings?tab=groups&from=plan&add=1"
            onClick={stashDraft}
            className="mt-1.5 inline-flex w-fit font-sans text-sm font-semibold text-clay underline hover:text-clayDeep"
          >
            + Add a group type
          </Link>
        </div>
        <div>
          <PButton
            type="submit"
            tone="terra"
            size="md"
            disabled={pending || !canSubmit}
          >
            {pending ? "Saving…" : "Add prospect"}
          </PButton>
          {!canSubmit ? (
            <p className="m-0 mt-1.5 font-sans text-sm text-ink3">
              Enter a full name to enable Add prospect.
            </p>
          ) : null}
        </div>
      </div>
      {/* successText is withheld once the timer fires so the confirmation
          auto-dismisses; errors (state not ok) always show. */}
      <FormStatus
        state={state}
        successText={showSuccess ? "Prospect added." : undefined}
      />
    </form>
  );
}
