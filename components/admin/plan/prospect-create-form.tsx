"use client";

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateProspect } from "@/app/(protected)/admin/plan/actions";
import {
  fieldErrorStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formGridStyle,
  formNoteStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { FULL_NAME_REQUIRED_MESSAGE } from "@/lib/admin/validation/prospect-form-client";
import type { GroupAudienceCategory } from "@/types/enums";
import type { CategoryOptionsByAudience } from "@/lib/supabase/group-categories-reads";

// The three top types, in board order, with their display labels.
const TOP_TYPES: { value: GroupAudienceCategory; label: string }[] = [
  { value: "men", label: "Men's" },
  { value: "women", label: "Women's" },
  { value: "mixed", label: "Mixed" },
];

// Add a Prospect to the funnel (acceptance #2). A new Prospect always lands in
// Interested with no group — the state machine moves them onward from there.
// #399: the form also captures the DESIRED cell — a top type + a category — that
// the prospect is interested in. The category select is filtered to the chosen
// top type's ACTIVE cells (categoryOptionsByAudience), so only real cells can be
// picked. Both are optional, but a category needs a top type chosen first.
export function ProspectCreateForm({
  categoryOptionsByAudience,
}: {
  categoryOptionsByAudience: CategoryOptionsByAudience;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateProspect,
    { resetOnSuccess: true }
  );

  // The chosen top type drives the category select's options. Resetting the type
  // clears the dependent category so a stale category from another type can't be
  // submitted.
  const [audience, setAudience] = useState<GroupAudienceCategory | "">("");
  const [categoryId, setCategoryId] = useState<string>("");

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

  // useActionForm resets the <form> element on success, but these two selects
  // are controlled by React state, so reset them too. Otherwise the next
  // prospect (entered with only a name) would resubmit the previous prospect's
  // desired cell and be miscounted into it. Depends on `state` (a fresh object
  // each submit) so a back-to-back success clears again, mirroring the group
  // forms' reset effect.
  useEffect(() => {
    if (!state?.ok) return;
    setAudience("");
    setCategoryId("");
    setFullNameError(undefined);
    setShowSuccess(true);
    const timer = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [state]);

  const categoryOptions =
    audience === "" ? [] : categoryOptionsByAudience[audience];

  return (
    <form
      ref={formRef}
      action={formAction}
      style={{ display: "grid", gap: 12 }}
    >
      <p style={formNoteStyle}>
        Only the name is required. New prospects start as <em>Interested</em>;
        move them to Matched once you have a group.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="prospect-full_name" style={fieldLabelStyle}>
            Full name
          </label>
          <input
            id="prospect-full_name"
            name="full_name"
            type="text"
            required
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
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Avery Bennett"
          />
          {/* Stable live region: kept mounted (hidden when clear) so the
              aria-describedby target is constant and role="alert" announces the
              message when validation populates it. */}
          <p
            id="prospect-full_name-error"
            role="alert"
            style={fieldErrorStyle}
            hidden={!fullNameError}
          >
            {fullNameError}
          </p>
        </div>
        <div>
          <label htmlFor="prospect-email" style={fieldLabelStyle}>
            Email (optional)
          </label>
          <input
            id="prospect-email"
            name="email"
            type="email"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="avery@example.com"
          />
        </div>
        <div>
          <label htmlFor="prospect-phone" style={fieldLabelStyle}>
            Phone (optional)
          </label>
          <input
            id="prospect-phone"
            name="phone"
            type="tel"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="(555) 555-0100"
          />
        </div>
        <div>
          <label
            htmlFor="prospect-desired_audience_category"
            style={fieldLabelStyle}
          >
            Interested in: top type (optional)
          </label>
          <select
            id="prospect-desired_audience_category"
            name="desired_audience_category"
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value as GroupAudienceCategory | "");
              // Reset the dependent category whenever the top type changes.
              setCategoryId("");
            }}
            style={fieldInputStyle}
          >
            <option value="">— None —</option>
            {TOP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="prospect-desired_category_id" style={fieldLabelStyle}>
            Interested in: category (optional)
          </label>
          <select
            id="prospect-desired_category_id"
            name="desired_category_id"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={audience === "" || categoryOptions.length === 0}
            style={fieldInputStyle}
          >
            <option value="">
              {audience === ""
                ? "Choose a top type first"
                : categoryOptions.length === 0
                  ? "No active categories for this type"
                  : "— None —"}
            </option>
            {categoryOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <PButton type="submit" tone="terra" size="md" disabled={pending}>
            {pending ? "Saving…" : "Add prospect"}
          </PButton>
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
