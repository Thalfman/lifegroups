"use client";

import Link from "next/link";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  BUILT_IN_RUBRIC_BANDS,
  DEFAULT_GROUP_RUBRIC_CRITERIA,
} from "@/lib/admin/health-rubric";
import { decorateReturn } from "@/lib/nav/return-to";

// The OPP-8 read-only "why?" peek (#781). Next to a group's Group-Health Grade
// it explains the GOVERNING RULE behind the letter — the fixed A–F score bands
// and the rubric dimensions the grade is scored on — without editing anything
// inline (editing global config from an entity's context stays a non-goal). For
// the sanctioned edit path it carries a deep link to the audited Settings rubric
// editor, REUSING the Phase-1 redirect-and-return round trip (decorateReturn +
// `from=group-health`): the user lands back on this group's health tab, focus
// restored to the standalone "Edit rubric" button (the ReturnFocus target). The
// peek itself never writes — it is presentation + a link.
export function HealthWhyPeek({
  groupId,
  fromSetup = false,
}: {
  groupId: string;
  fromSetup?: boolean;
}) {
  const bands = BUILT_IN_RUBRIC_BANDS;
  // Same outbound shape as EditRubricLink: the Settings care tab, scoped to this
  // group, carrying the return marker (and the setup origin when relevant).
  const editHref = decorateReturn(
    `/admin/settings?tab=care&group=${groupId}${
      fromSetup ? "&origin_setup=1" : ""
    }`,
    "group-health"
  );

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Why this grade? Show the governing Group-Health rubric"
        className="inline-flex items-center rounded-pill border border-line bg-surface px-2.5 py-1 font-sans text-xs font-semibold text-ink2 transition-colors duration-150 hover:bg-surfaceAlt"
      >
        Why?
      </PopoverTrigger>
      <PopoverContent className="z-dropdown grid w-[260px] gap-2.5 rounded-md border border-line bg-surface p-3.5 shadow-softLg">
        <p className="m-0 font-sans text-xs font-semibold uppercase tracking-wide text-ink3">
          How this grade is set
        </p>
        <p className="m-0 font-sans text-sm text-ink2">
          The score rolls up to a letter on these bands:
        </p>
        <ul className="m-0 grid list-none gap-0.5 p-0 font-sans text-sm text-ink2">
          <li>A · {bands.a}% and up</li>
          <li>
            B · {bands.b}–{bands.a - 1}%
          </li>
          <li>
            C · {bands.c}–{bands.b - 1}%
          </li>
          <li>
            D · {bands.d}–{bands.c - 1}%
          </li>
          <li>F · below {bands.d}%</li>
        </ul>
        <p className="m-0 font-sans text-sm text-ink2">
          Scored on{" "}
          {DEFAULT_GROUP_RUBRIC_CRITERIA.map((c) => c.label.toLowerCase()).join(
            ", "
          )}
          , weighted in the rubric.
        </p>
        <Link
          href={editHref}
          className="font-sans text-sm font-semibold text-clay no-underline hover:underline"
        >
          Edit rubric in Settings →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
