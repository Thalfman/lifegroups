"use client";

import { useState } from "react";
import type { ProspectState } from "@/types/enums";
import { PButton } from "@/components/pastoral/button";
import { adminTransitionProspect } from "@/app/(protected)/admin/plan/actions";
import {
  fieldLabelStyle,
  fieldSelectStyle,
} from "@/components/admin/forms/field-styles";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import {
  PROSPECT_STATE_LABEL,
  canTransition,
  stateRequiresGroup,
} from "@/lib/admin/prospect-funnel";
import type { ProspectBoardEntry } from "@/lib/supabase/prospect-reads";
import type { PlanGroupOption } from "@/components/admin/plan/plan-data";
import { P, fontBody, fontSans } from "@/lib/pastoral";

// All states a Prospect can be moved to (the four-state funnel). The card
// offers exactly the legal targets for its current state, with a group picker
// shown when the target requires one (Matched / Joined).
const ALL_STATES: readonly ProspectState[] = [
  "interested",
  "matched",
  "joined",
  "not_at_this_time",
];

export function ProspectCard({
  prospect,
  groupName,
  activeGroups,
}: {
  prospect: ProspectBoardEntry;
  // The Prospect's current group name, when attached (e.g. a Matched prospect).
  groupName: string | null;
  activeGroups: PlanGroupOption[];
}) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminTransitionProspect
  );

  const legalTargets = ALL_STATES.filter((to) =>
    canTransition(prospect.state, to)
  );
  const [target, setTarget] = useState<ProspectState | "">("");
  const needsGroup = target !== "" && stateRequiresGroup(target);

  return (
    <div
      style={{
        border: `1px solid ${P.line}`,
        background: P.surface,
        borderRadius: 10,
        padding: "12px 14px",
        display: "grid",
        gap: 8,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 14,
            fontWeight: 600,
            color: P.ink,
          }}
        >
          {prospect.full_name}
        </div>
        {prospect.email || prospect.phone ? (
          <div style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
            {[prospect.email, prospect.phone].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        {groupName ? (
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink2,
              marginTop: 2,
            }}
          >
            Group: {groupName}
          </div>
        ) : null}
      </div>

      {legalTargets.length > 0 ? (
        <form action={formAction} style={{ display: "grid", gap: 6 }}>
          <input type="hidden" name="prospect_id" value={prospect.id} />
          <label
            htmlFor={`move-${prospect.id}`}
            style={{ ...fieldLabelStyle, marginBottom: 2 }}
          >
            Move to
          </label>
          <select
            id={`move-${prospect.id}`}
            name="state"
            value={target}
            onChange={(e) => setTarget(e.target.value as ProspectState | "")}
            style={{ ...fieldSelectStyle, padding: "8px 10px" }}
          >
            <option value="">—</option>
            {legalTargets.map((to) => (
              <option key={to} value={to}>
                {PROSPECT_STATE_LABEL[to]}
              </option>
            ))}
          </select>
          {needsGroup ? (
            <select
              name="group_id"
              defaultValue={prospect.group_id ?? ""}
              required
              style={{ ...fieldSelectStyle, padding: "8px 10px" }}
            >
              <option value="">Pick a group…</option>
              {activeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : null}
          <div>
            <PButton
              type="submit"
              tone="ghost"
              size="sm"
              disabled={pending || target === ""}
            >
              {pending ? "Moving…" : "Apply"}
            </PButton>
          </div>
          <FormStatus state={state} successText="Moved." />
        </form>
      ) : null}
    </div>
  );
}
