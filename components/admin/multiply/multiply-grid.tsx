"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  useActionForm,
  FormStatus,
} from "@/components/admin/forms/action-form";
import { adminSetGroupTypeConfig } from "@/app/(protected)/admin/settings/actions";
import {
  fieldInputClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
import {
  segmentAnchorId,
  segmentShepherdsAnchorId,
} from "@/lib/admin/multiplication";
import type { MultiplyTypeRow } from "@/components/admin/multiply/multiply-grid-data";
import { Button, LinkButton } from "@/components/ui/button";

// Presentational Multiply BY-TYPE list. The old per-cell (Audience × Category)
// grid is gone: rows are now the free-text group TYPES. Each row shows its
// coverage ("have X of Y") and a per-type config editor — the target group count
// plus an optional readiness-rule override (left blank to inherit the single
// global readiness rule edited in Settings). Coverage is informational; the rule
// is configurable. The config editor posts to the audited
// admin_set_group_type_config RPC via adminSetGroupTypeConfig.

function CoverageBadge({ have, target }: { have: number; target: number }) {
  const met = target > 0 && have >= target;
  return (
    <Badge tone={met ? "sage" : "neutral"}>
      have {have} of {target}
    </Badge>
  );
}

function TypeConfigForm({ row }: { row: MultiplyTypeRow }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    adminSetGroupTypeConfig
  );
  const [target, setTarget] = useState(String(row.target));
  const [overrideText, setOverrideText] = useState(
    row.readinessRule ? JSON.stringify(row.readinessRule) : ""
  );

  return (
    <form action={formAction} className="grid gap-2.5">
      <input type="hidden" name="group_type" value={row.groupType} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`target-${row.groupType}`}
            className={fieldLabelClassName}
          >
            Target group count
          </label>
          <input
            id={`target-${row.groupType}`}
            name="target_count"
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={fieldInputClassName}
          />
        </div>
        <div>
          <label
            htmlFor={`override-${row.groupType}`}
            className={fieldLabelClassName}
          >
            Readiness override (optional JSON)
          </label>
          <input
            id={`override-${row.groupType}`}
            name="readiness_rule"
            type="text"
            value={overrideText}
            onChange={(e) => setOverrideText(e.target.value)}
            placeholder="Leave blank to inherit the global rule"
            className={`${fieldInputClassName} font-mono`}
          />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending}
          aria-label={`Save ${row.label} configuration`}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <FormStatus state={state} successText="Saved." />
      </div>
    </form>
  );
}

export function MultiplyGridView({
  rows,
  ministryYear,
}: {
  rows: MultiplyTypeRow[];
  ministryYear: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="grid justify-items-start gap-3.5">
        <p className="m-0 font-sans text-base text-ink2">
          No group types yet. Add them in Settings &rsaquo; Groups, then each
          type appears here with its coverage and per-type config.
        </p>
        <LinkButton
          href="/admin/settings?tab=groups"
          variant="primary"
          size="md"
        >
          Set up group types in Settings →
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="m-0 font-sans text-sm text-ink2">
        Ministry year {ministryYear}–{ministryYear + 1}. One row per group type,
        showing its <code className="font-mono">have X of Y</code> coverage
        (active and launching groups vs. the type&rsquo;s target). Set each
        type&rsquo;s target and an optional readiness override below; with no
        override a type inherits the single global readiness rule.
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <LinkButton href="/admin/settings?tab=groups" variant="ghost" size="sm">
          Edit group types →
        </LinkButton>
        <LinkButton
          href="/admin/settings?tab=multiply"
          variant="ghost"
          size="sm"
        >
          Edit the global readiness rule →
        </LinkButton>
      </div>

      <ul className="m-0 grid list-none gap-3 p-0">
        {rows.map((row) => (
          <li
            key={row.groupType}
            className="grid gap-3 rounded-md border border-line bg-surface p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <h3 className="m-0 font-sans text-base font-semibold text-ink">
                {row.label}
              </h3>
              <CoverageBadge have={row.have} target={row.target} />
            </div>
            {/* #759: deep-link this type down to its Pipeline candidates and its
                matched shepherds, so the type, the groups multiplying into it,
                and the people who could lead the new group connect into one
                story. Both land on the Pipeline tab (where #758 placed the
                matched shepherds); the shell switches tabs from `?tab=` and the
                `#seg-…` hash scrolls to the section. */}
            <div className="flex flex-wrap items-center gap-2">
              <LinkButton
                href={`/admin/multiply?tab=pipeline#${segmentAnchorId(
                  row.groupType
                )}`}
                variant="ghost"
                size="sm"
              >
                View candidates →
              </LinkButton>
              <LinkButton
                href={`/admin/multiply?tab=pipeline#${segmentShepherdsAnchorId(
                  row.groupType
                )}`}
                variant="ghost"
                size="sm"
              >
                View shepherds →
              </LinkButton>
            </div>
            <TypeConfigForm row={row} />
          </li>
        ))}
      </ul>
    </div>
  );
}
