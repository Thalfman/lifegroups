// Julian #144: seed the multiplication planner from Julian's Google Doc
// (docs/julian-inputs/LG_MULTIPLICATION_PLAN_2026.md) so he opens a populated
// surface, not a blank one (ADR 0006). The Doc is the source of truth — this
// module is a faithful, mechanical transcription of it plus the pure mapping
// from Doc entries to `groups` + `multiplication_candidates` seed rows.
//
// Two principles run through the mapping:
//   * Preserve ambiguity. The Doc's `(?)` markers, count/reconciliation
//     caveats, and parenthetical asides are carried into candidate notes, not
//     resolved or dropped (ADR 0006).
//   * Don't invent. The 2026-vs-2027 split is not recoverable from the Doc, so
//     target_year is left null for Julian to set in-app (R4 / ADR 0006).

import type {
  GroupAudienceCategory,
  GroupLifeStage,
  MultiplicationCandidateStatus,
  MultiplicationMeetingTime,
} from "@/types/enums";

// One leader line from the Doc. The group is identified by its shepherd, which
// is how Julian names them in the Doc; he can rename in-app afterward.
export type MultiplicationSeedEntry = {
  leader: string;
  audience: GroupAudienceCategory;
  lifeStage: GroupLifeStage;
  // The Doc's `(N)`: current member count, or null when absent/`(?)`.
  memberCount: number | null;
  // The Doc's second `(Name)`: the successor/leader-designate, or null.
  successor: string | null;
  meetingTime: MultiplicationMeetingTime | null;
  // The Doc's `(?)` against the entry as a whole: unconfirmed / to be
  // determined. Preserved, never resolved.
  uncertain?: boolean;
  // Verbatim source asides to carry across untouched (e.g. "(closing in
  // August)", "(Vietmeier's?)", reconciliation caveats). Preserved as-is.
  caveats?: string[];
};

export type GroupSeedRow = {
  name: string;
  audienceCategory: GroupAudienceCategory;
  lifeStage: GroupLifeStage;
};

export type CandidateSeedRow = {
  groupName: string;
  targetYear: number | null;
  status: MultiplicationCandidateStatus;
  shepherdWilling: boolean;
  needsSimilarStage: boolean;
  successorDesignate: string | null;
  meetingTime: MultiplicationMeetingTime | null;
  notes: string | null;
  // ADR 0022: the Doc's `(N)` count, fed into the structured manual_member_count
  // column so seeded groups read Julian's headcount rather than the (unseeded →
  // 0) in-app roster. Still mirrored in notes as provenance (buildCandidateNotes).
  manualMemberCount: number | null;
};

// Compose the candidate's notes from everything the Doc carries that the
// schema has no column for: the member count (live counts come from
// memberships, so the Doc's snapshot is provenance only). Ambiguity markers
// and source caveats are layered on in later slices. Returns null when there
// is nothing to preserve, so existing-null notes semantics are unchanged.
export function buildCandidateNotes(
  entry: MultiplicationSeedEntry
): string | null {
  const parts: string[] = [];

  if (entry.memberCount != null) {
    parts.push(`Doc: ${entry.memberCount} members at time of plan.`);
  }

  if (entry.uncertain) {
    parts.push(
      "Doc marked this entry `(?)` — unconfirmed; verify with Julian."
    );
  }

  // Caveat strings are already self-framed ("Doc note: …", "Doc bracket: …",
  // "Section reconciliation: …") so they're carried verbatim.
  for (const caveat of entry.caveats ?? []) {
    parts.push(caveat);
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

export function buildSeedRows(entries: MultiplicationSeedEntry[]): {
  groups: GroupSeedRow[];
  candidates: CandidateSeedRow[];
} {
  const groups: GroupSeedRow[] = entries.map((e) => ({
    name: e.leader,
    audienceCategory: e.audience,
    lifeStage: e.lifeStage,
  }));

  const candidates: CandidateSeedRow[] = entries.map((e) => ({
    groupName: e.leader,
    targetYear: null,
    status: "watching",
    shepherdWilling: false,
    needsSimilarStage: false,
    successorDesignate: e.successor,
    meetingTime: e.meetingTime,
    notes: buildCandidateNotes(e),
    manualMemberCount: e.memberCount,
  }));

  return { groups, candidates };
}

// ---------------------------------------------------------------------------
// The Doc, transcribed. Source of truth:
// docs/julian-inputs/LG_MULTIPLICATION_PLAN_2026.md. Counts, names, successors,
// meeting times, `(?)` markers and parenthetical asides are reproduced as the
// Doc has them. The "launch from scratch" interest-list people (Karl & Lori
// Asen, Chad & Shannon Heimsoth, the from-scratch Beasley line) are NOT here —
// they aren't groups and are deferred (ADR 0006).
// ---------------------------------------------------------------------------

// Section-level reconciliation caveats the Doc itself flags. They attach to
// every entry in the affected section so the mismatch is never dropped and is
// visible on whichever candidate Julian opens.
const WOMENS_COUNT_CAVEAT =
  "Section reconciliation: the Doc's women's header says \"6 groups\" but seven shepherds are listed; the count and the listed shepherds do not reconcile in the source.";
const MIXED_COUNT_CAVEAT =
  'Section reconciliation: the Doc\'s mixed header says "18 groups"; the listed shepherds do not cleanly reconcile to that count (e.g. the Beasley line shares a source line with the Krispins).';
const RETIREMENT_HEDGE_CAVEAT =
  'Doc bracket header hedge: "Retirement (some or most of them)".';

export const MULTIPLICATION_SEED_ENTRIES: MultiplicationSeedEntry[] = [
  // --- Men's ---
  {
    leader: "George Kelly",
    audience: "men",
    lifeStage: "multi_generational",
    memberCount: 9,
    successor: null,
    meetingTime: null,
    caveats: ["Doc bracket: Men's \"50's – 60's\"."],
  },
  {
    leader: "Tim Boberg",
    audience: "men",
    lifeStage: "multi_generational",
    memberCount: 13,
    successor: null,
    meetingTime: null,
    caveats: ["Doc bracket: Men's \"60's – 70's\"."],
  },
  {
    leader: "Nate Baron",
    audience: "men",
    lifeStage: "multi_generational",
    memberCount: 10,
    successor: "Tony L.",
    meetingTime: null,
  },
  {
    leader: "Mike Irizarry",
    audience: "men",
    lifeStage: "multi_generational",
    memberCount: 15,
    successor: "Jon H.",
    meetingTime: null,
  },
  {
    leader: "George Diamond",
    audience: "men",
    lifeStage: "multi_generational",
    memberCount: 6,
    successor: null,
    meetingTime: null,
  },

  // --- Women's (header "6 groups" vs seven listed — caveat on each) ---
  {
    leader: "Stephanie Hichox",
    audience: "women",
    lifeStage: "young_families",
    memberCount: 15,
    successor: null,
    meetingTime: null,
    uncertain: true,
    caveats: ["Doc bracket: Women's \"30's – 40's\".", WOMENS_COUNT_CAVEAT],
  },
  {
    leader: "Diana Johnson",
    audience: "women",
    lifeStage: "multi_generational",
    memberCount: 15,
    successor: "Cindy Kessaris",
    meetingTime: null,
    caveats: ["Doc bracket: Women's \"50's – 60's\".", WOMENS_COUNT_CAVEAT],
  },
  {
    leader: "Christine Mathias",
    audience: "women",
    lifeStage: "multi_generational",
    memberCount: 12,
    successor: null,
    meetingTime: null,
    caveats: ["Doc bracket: Women's \"50's – 60's\".", WOMENS_COUNT_CAVEAT],
  },
  {
    leader: "Gail Blair",
    audience: "women",
    lifeStage: "multi_generational",
    memberCount: 4,
    successor: null,
    meetingTime: null,
    caveats: ["Doc bracket: Women's \"60's – 70's\".", WOMENS_COUNT_CAVEAT],
  },
  {
    leader: "Donna Lawrence",
    audience: "women",
    lifeStage: "multi_generational",
    memberCount: 13,
    successor: null,
    meetingTime: null,
    caveats: ["Doc bracket: Women's \"60's – 70's\".", WOMENS_COUNT_CAVEAT],
  },
  {
    leader: "Judi Tripp",
    audience: "women",
    lifeStage: "multi_generational",
    memberCount: 9,
    successor: null,
    meetingTime: null,
    caveats: ["Doc bracket: Women's \"60's – 70's\".", WOMENS_COUNT_CAVEAT],
  },
  {
    leader: "Sandra Lea",
    audience: "women",
    lifeStage: "spanish_speaking",
    memberCount: null,
    successor: null,
    meetingTime: null,
    uncertain: true,
    caveats: [WOMENS_COUNT_CAVEAT],
  },

  // --- Mixed (header "18 groups") ---
  {
    leader: "Keith and Joy Krispin",
    audience: "mixed",
    lifeStage: "young_professionals",
    memberCount: 17,
    successor: null,
    meetingTime: null,
  },
  {
    leader: "Mike and Mary Jo Beasley",
    audience: "mixed",
    lifeStage: "young_professionals",
    memberCount: null,
    successor: null,
    meetingTime: null,
    uncertain: true,
    caveats: [
      "Doc note: on the same source line as the Krispins.",
      MIXED_COUNT_CAVEAT,
    ],
  },
  {
    leader: "Caleb and Kate Senyshyn",
    audience: "mixed",
    lifeStage: "young_professionals",
    memberCount: 8,
    successor: null,
    meetingTime: null,
  },

  {
    leader: "Ben and Gracie Bertsche",
    audience: "mixed",
    lifeStage: "young_families",
    memberCount: 12,
    successor: null,
    meetingTime: null,
  },
  {
    leader: "Julian and Paula Guevara",
    audience: "mixed",
    lifeStage: "young_families",
    memberCount: 8,
    successor: null,
    meetingTime: null,
    caveats: ["Doc note: (closing in August)."],
  },

  {
    leader: "Calvin and Julianne Braker",
    audience: "mixed",
    lifeStage: "families_with_kids",
    memberCount: 14,
    successor: null,
    meetingTime: null,
  },
  {
    leader: "David and Megan Cahill",
    audience: "mixed",
    lifeStage: "families_with_kids",
    memberCount: 12,
    successor: "Gonzalez",
    meetingTime: null,
  },
  {
    leader: "Andre and Lindsey Patrick",
    audience: "mixed",
    lifeStage: "families_with_kids",
    memberCount: 12,
    successor: "Marshalls",
    meetingTime: null,
  },

  // "Families with young professional kids" has no exact life_stage enum value;
  // mapped to the closest (families_with_adult_kids) with the original label
  // preserved verbatim so the remap is visible, not silent.
  {
    leader: "Dennis Rens",
    audience: "mixed",
    lifeStage: "families_with_adult_kids",
    memberCount: 15,
    successor: null,
    meetingTime: null,
    uncertain: true,
    caveats: [
      'Doc bracket: "Families with young professional kids" (no exact life-stage value; mapped to families_with_adult_kids).',
    ],
  },

  {
    leader: "Ron and Carole Lanier",
    audience: "mixed",
    lifeStage: "families_with_adult_kids",
    memberCount: 10,
    successor: null,
    meetingTime: null,
  },
  {
    leader: "Keith and Mary Lee",
    audience: "mixed",
    lifeStage: "families_with_adult_kids",
    memberCount: 10,
    successor: null,
    meetingTime: null,
  },

  {
    leader: "Tim and Sou Boberg",
    audience: "mixed",
    lifeStage: "retirement",
    memberCount: 12,
    successor: null,
    meetingTime: "during_the_day",
    caveats: [RETIREMENT_HEDGE_CAVEAT],
  },
  {
    leader: "Carol Dembkowski",
    audience: "mixed",
    lifeStage: "retirement",
    memberCount: 8,
    successor: null,
    meetingTime: "evening",
    caveats: [RETIREMENT_HEDGE_CAVEAT],
  },
  {
    leader: "Phil and Karen Dickert",
    audience: "mixed",
    lifeStage: "retirement",
    memberCount: 12,
    successor: null,
    meetingTime: "during_the_day",
    caveats: [RETIREMENT_HEDGE_CAVEAT],
  },
  {
    leader: "Jere and Jana Miller",
    audience: "mixed",
    lifeStage: "retirement",
    memberCount: 12,
    successor: null,
    meetingTime: "during_the_day",
    caveats: [
      "Doc note: (Vietmeier's?) — ambiguous successor/over-shepherd, unconfirmed.",
      RETIREMENT_HEDGE_CAVEAT,
    ],
  },
  {
    leader: "Phil and Karen Thatcher",
    audience: "mixed",
    lifeStage: "retirement",
    memberCount: 13,
    successor: null,
    meetingTime: "evening",
    caveats: [RETIREMENT_HEDGE_CAVEAT],
  },
  {
    leader: "Ray and Julie Herrick",
    audience: "mixed",
    lifeStage: "retirement",
    memberCount: 12,
    successor: null,
    meetingTime: "during_the_day",
    caveats: [RETIREMENT_HEDGE_CAVEAT],
  },

  {
    leader: "Chris/Sydney Anderson",
    audience: "mixed",
    lifeStage: "multi_generational",
    memberCount: 6,
    successor: null,
    meetingTime: null,
  },
  {
    leader: "Phil and Sandy Leman",
    audience: "mixed",
    lifeStage: "multi_generational",
    memberCount: 12,
    successor: null,
    meetingTime: null,
  },
];

// SQL string literal: single quotes doubled, or `null` when absent. Keeps the
// rendered seed injection-safe even though the inputs are committed source.
function sqlText(value: string | null): string {
  if (value == null) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlMeetingTime(value: MultiplicationMeetingTime | null): string {
  return value == null
    ? "null"
    : `'${value}'::public.multiplication_meeting_time`;
}

// Render an idempotent SQL seed for the planner, runnable like
// supabase/seed/phase2_seed.sql. Each entry:
//   * inserts its group only when no group of that name exists, so re-running
//     is a no-op rather than a duplicate;
//   * inserts its candidate only when the group has no active (non-archived)
//     candidate, honouring the one-active-per-group invariant and never
//     creating a duplicate active candidate on re-run.
// No hard deletes; archived candidates are left untouched.
export function renderMultiplicationSeedSql(
  entries: MultiplicationSeedEntry[]
): string {
  const { groups, candidates } = buildSeedRows(entries);

  const blocks = entries.map((entry, i) => {
    const group = groups[i];
    const candidate = candidates[i];
    const name = sqlText(group.name);

    // #398: life_stage was retired as the segmentation source — groups now carry
    // a free-form category_id, tagged by an admin in-app (no 1:1 backfill from
    // the Doc's life-stage brackets). The seed therefore inserts each group as
    // Uncategorized; the Doc's life-stage bracket is preserved only as the block
    // comment below for provenance.
    const groupInsert =
      `insert into public.groups (name, audience_category)\n` +
      `select ${name}, '${group.audienceCategory}'::public.group_audience_category\n` +
      `where not exists (select 1 from public.groups where name = ${name});`;

    const candidateInsert =
      `insert into public.multiplication_candidates (\n` +
      `  group_id, target_year, status, shepherd_willing, needs_similar_stage,\n` +
      `  notes, successor_designate, meeting_time, manual_member_count\n` +
      `)\n` +
      `select g.id, ${candidate.targetYear ?? "null"}, ` +
      `'${candidate.status}'::public.multiplication_candidate_status, ` +
      `${candidate.shepherdWilling}, ${candidate.needsSimilarStage},\n` +
      `  ${sqlText(candidate.notes)}, ${sqlText(candidate.successorDesignate)}, ` +
      `${sqlMeetingTime(candidate.meetingTime)}, ${candidate.manualMemberCount ?? "null"}\n` +
      `from public.groups g\n` +
      `where g.name = ${name}\n` +
      `  and not exists (\n` +
      `    select 1 from public.multiplication_candidates c\n` +
      `    where c.group_id = g.id and c.archived_at is null\n` +
      `  );`;

    return `-- ${group.name} (${group.audienceCategory} / ${group.lifeStage})\n${groupInsert}\n\n${candidateInsert}`;
  });

  return blocks.join("\n\n");
}

// Preamble for the committed seed file. Documents provenance and that the file
// is generated, so it is regenerated rather than hand-edited.
const SEED_FILE_HEADER = `-- Julian #144: multiplication planner seed.
--
-- GENERATED FILE — do not edit by hand. Regenerate with:
--   npx tsx scripts/generate-multiplication-seed.ts
-- Source of truth: lib/admin/multiplication-seed.ts, transcribing
-- docs/julian-inputs/LG_MULTIPLICATION_PLAN_2026.md (left in place as the
-- provenance record per ADR 0006). A drift guard test pins this file to the
-- module output.
--
-- Run after the schema + segmentation + pipeline migrations, like
-- supabase/seed/phase2_seed.sql. Idempotent: groups insert only when absent;
-- candidates insert only when the group has no active (non-archived)
-- candidate, so re-running never duplicates an active candidate. No hard
-- deletes. target_year is intentionally null — Julian sets the 2026/2027 split
-- in-app (ADR 0006 / R4).`;

// The full committed seed file: header + rendered entries, newline-terminated.
export function renderMultiplicationSeedFile(): string {
  return `${SEED_FILE_HEADER}\n\n${renderMultiplicationSeedSql(MULTIPLICATION_SEED_ENTRIES)}\n`;
}
