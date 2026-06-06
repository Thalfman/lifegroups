"use client";

import { useEffect, useState } from "react";
import { PButton } from "@/components/pastoral/button";
import { adminCreateGroup } from "@/app/(protected)/admin/groups/actions";
import {
  fieldInputStyle,
  fieldLabelStyle,
  fieldSelectStyle,
  formGridStyle,
  formNoteStyle,
} from "./field-styles";
import { P, fontBody } from "@/lib/pastoral";
import {
  MEETING_DAYS_ORDERED,
  MEETING_FREQUENCY_OPTIONS,
  MEETING_PARITY_OPTIONS,
} from "./meeting-schedule-options";
import type { GroupAudienceCategory, MeetingFrequency } from "@/types/enums";
import { useActionForm, FormStatus } from "./action-form";
import {
  EMPTY_CATEGORIES_BY_AUDIENCE,
  optionsForAudience,
  type CategoriesByAudience,
} from "./group-category-options";

export function GroupCreateForm({
  // G3 (#222): a new group's capacity defaults to the ministry-wide
  // `default_group_capacity` instead of being left Unknown, so an operator
  // only sets a per-group number when a group differs. null = no ministry
  // default configured, in which case we leave the field blank (Unknown).
  defaultCapacity,
  // Supplied when rendered inside the EditingSurface drawer (#266): `onSaved`
  // closes + refreshes once the group is created, `onDirty` lets the drawer
  // warn before discarding entered values, `onCancel` renders a Cancel control
  // beside Create, and `onPendingChange` lets the drawer block dismissal while
  // the create is in flight.
  onSaved,
  onDirty,
  onCancel,
  onPendingChange,
  // #398: the category-picker options grouped by top type. The picker filters to
  // the categories applied to the group's selected audience (its cell).
  categoriesByAudience = EMPTY_CATEGORIES_BY_AUDIENCE,
}: {
  defaultCapacity: number | null;
  onSaved?: () => void;
  onDirty?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
  categoriesByAudience?: CategoriesByAudience;
}) {
  const { state, formAction, pending, formRef } = useActionForm<{ id: string }>(
    adminCreateGroup,
    { resetOnSuccess: true }
  );
  const [frequency, setFrequency] = useState<MeetingFrequency>("weekly");
  const [showMore, setShowMore] = useState(false);
  // #398: the live audience selection drives which categories the picker offers
  // (only those with an active cell under that top type). "" = unset.
  const [audience, setAudience] = useState<GroupAudienceCategory | "">("");

  // useActionForm resets the <form> element on success; the local UI state
  // (frequency select, expanded "More details") lives in React, so reset it too.
  // In the drawer, `onSaved` then closes it — the form unmounts, so the reset
  // above is moot there but harmless.
  useEffect(() => {
    if (!state?.ok) return;
    setFrequency("weekly");
    setShowMore(false);
    setAudience("");
    onSaved?.();
  }, [state, onSaved]);

  // Mirror the in-flight state up so the drawer keeps itself open until the
  // create resolves rather than being dismissed mid-write.
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const showParity = frequency === "biweekly";

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={onDirty}
      style={{ display: "grid", gap: 12 }}
    >
      <p style={formNoteStyle}>
        Create a new Life Group. Start with the name and when it meets &mdash;
        everything else can be filled in under More details, now or later as the
        group settles into a rhythm.
      </p>
      <div className="lg-m-grid-stack" style={formGridStyle}>
        <div>
          <label htmlFor="group-name" style={fieldLabelStyle}>
            Group name
          </label>
          <input
            id="group-name"
            name="name"
            type="text"
            required
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Wednesday Westside"
          />
        </div>
        <div>
          <label htmlFor="group-meeting_day" style={fieldLabelStyle}>
            Meeting day (optional)
          </label>
          <select
            id="group-meeting_day"
            name="meeting_day"
            defaultValue=""
            style={fieldSelectStyle}
          >
            <option value="">Not set</option>
            {MEETING_DAYS_ORDERED.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="group-meeting_time" style={fieldLabelStyle}>
            Meeting time (optional)
          </label>
          <input
            id="group-meeting_time"
            name="meeting_time"
            type="time"
            autoComplete="off"
            style={fieldInputStyle}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        style={{
          justifySelf: "start",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: fontBody,
          fontSize: 12.5,
          color: P.ink2,
          textDecoration: "underline",
        }}
      >
        {showMore ? "Fewer details" : "More details"}
      </button>
      {/* Kept mounted (hidden) when collapsed so values entered under
          More details — most importantly meeting_frequency, which would
          otherwise default back to weekly on the server — still submit
          with the form rather than being silently discarded. */}
      <div
        className="lg-m-grid-stack"
        style={showMore ? formGridStyle : { ...formGridStyle, display: "none" }}
      >
        <div>
          <label htmlFor="group-meeting_frequency" style={fieldLabelStyle}>
            Meeting frequency
          </label>
          <select
            id="group-meeting_frequency"
            name="meeting_frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as MeetingFrequency)}
            style={fieldSelectStyle}
          >
            {MEETING_FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {showParity ? (
          <div>
            <label htmlFor="group-meeting_week_parity" style={fieldLabelStyle}>
              Which weeks does it meet?
            </label>
            <select
              id="group-meeting_week_parity"
              name="meeting_week_parity"
              defaultValue=""
              style={fieldSelectStyle}
            >
              <option value="">Choose weeks</option>
              {MEETING_PARITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: P.ink3,
                margin: "6px 0 0",
                lineHeight: 1.4,
              }}
            >
              For groups that meet every other week. Odd and even weeks
              alternate through the year — pick the set this group gathers on.
            </p>
          </div>
        ) : null}
        <div>
          <label htmlFor="group-location_area" style={fieldLabelStyle}>
            Location area (optional)
          </label>
          <input
            id="group-location_area"
            name="location_area"
            type="text"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="Westside"
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="group-address_optional" style={fieldLabelStyle}>
            Address (optional)
          </label>
          <input
            id="group-address_optional"
            name="address_optional"
            type="text"
            autoComplete="off"
            style={fieldInputStyle}
            placeholder="123 Vine St."
          />
        </div>
        <div>
          <label htmlFor="group-capacity" style={fieldLabelStyle}>
            Capacity (optional)
          </label>
          <input
            id="group-capacity"
            name="capacity"
            // Expanded: a real number control with range checks for inline
            // feedback. Collapsed: a plain text field so NONE of the number
            // control's native validation (range, step/whole-number, bad
            // input) can block submission from a non-focusable, hidden
            // element. The server validator then surfaces any visible
            // "Capacity must be a whole number / can't be negative / over
            // 1000" error. inputMode stays numeric for the mobile keypad.
            type={showMore ? "number" : "text"}
            min={showMore ? 0 : undefined}
            max={showMore ? 1000 : undefined}
            inputMode="numeric"
            autoComplete="off"
            style={fieldInputStyle}
            // G3 (#222): seed with the ministry default so the new group
            // starts with a sensible capacity rather than Unknown. The field
            // stays mounted while collapsed, so the default submits even when
            // the operator never opens "More details". Clear it to leave the
            // group's capacity Unknown.
            defaultValue={defaultCapacity ?? ""}
            placeholder={
              defaultCapacity != null ? String(defaultCapacity) : "Unknown"
            }
          />
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
              margin: "6px 0 0",
              lineHeight: 1.4,
            }}
          >
            {defaultCapacity != null
              ? `Defaults to the ministry capacity of ${defaultCapacity}. Change it for a group that's different, or clear it to leave capacity Unknown.`
              : "No ministry default set, so capacity starts Unknown. Set a number for this group, or leave it blank."}
          </p>
        </div>
        <div>
          <label htmlFor="group-audience_category" style={fieldLabelStyle}>
            Audience (optional)
          </label>
          <select
            id="group-audience_category"
            name="audience_category"
            value={audience}
            onChange={(e) =>
              setAudience(e.target.value as GroupAudienceCategory | "")
            }
            style={fieldSelectStyle}
          >
            <option value="">Unset</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="mixed">Mixed / couples</option>
          </select>
        </div>
        <div>
          <label htmlFor="group-category_id" style={fieldLabelStyle}>
            Category (optional)
          </label>
          <select
            id="group-category_id"
            name="category_id"
            // Keyed by audience so the selection resets when the top type
            // changes (a category from the old type wouldn't apply to the new
            // one). "" = Uncategorized.
            key={audience}
            defaultValue=""
            disabled={!audience}
            style={fieldSelectStyle}
          >
            <option value="">Uncategorized</option>
            {optionsForAudience(categoriesByAudience, audience).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
              margin: "6px 0 0",
              lineHeight: 1.4,
            }}
          >
            {audience
              ? "Categories applied to this audience. Leave Uncategorized to tag it later."
              : "Pick an audience first to choose a category. Until then the group is Uncategorized."}
          </p>
        </div>
        <div>
          <label htmlFor="group-launched_on" style={fieldLabelStyle}>
            Launched on (optional)
          </label>
          <input
            id="group-launched_on"
            name="launched_on"
            type="date"
            style={fieldInputStyle}
          />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label htmlFor="group-description" style={fieldLabelStyle}>
            Description (optional)
          </label>
          <textarea
            id="group-description"
            name="description"
            rows={3}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 80 }}
            placeholder="Who this group is for, what makes it tick."
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <PButton type="submit" tone="terra" size="md" disabled={pending}>
          {pending ? "Creating…" : "Create group"}
        </PButton>
        {onCancel ? (
          <PButton
            type="button"
            tone="ghost"
            size="md"
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </PButton>
        ) : null}
      </div>
      <FormStatus state={state} successText="Group created." />
    </form>
  );
}
