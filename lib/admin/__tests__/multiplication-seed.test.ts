import { describe, expect, it } from "vitest";

import {
  buildCandidateNotes,
  buildSeedRows,
  MULTIPLICATION_SEED_ENTRIES,
  renderMultiplicationSeedFile,
  renderMultiplicationSeedSql,
  type MultiplicationSeedEntry,
} from "@/lib/admin/multiplication-seed";
import { normalizeTextFixture } from "./migration-safety";

// Julian #144: the seed maps Julian's Google-Doc multiplication plan
// (docs/julian-inputs/LG_MULTIPLICATION_PLAN_2026.md) into `groups` +
// `multiplication_candidates`. These tests exercise the mechanical mapping —
// the source of truth is the Doc, so the job is faithful transcription, not
// data authoring. Ambiguity in the Doc is preserved, never resolved.

const entry = (
  over: Partial<MultiplicationSeedEntry>
): MultiplicationSeedEntry => ({
  leader: "Test Leader",
  audience: "men",
  lifeStage: "multi_generational",
  memberCount: null,
  successor: null,
  meetingTime: null,
  ...over,
});

describe("buildSeedRows — Doc entry to group + candidate", () => {
  it("maps a single entry to one segmented group and one linked candidate", () => {
    const { groups, candidates } = buildSeedRows([
      entry({
        leader: "Nate Baron",
        audience: "men",
        lifeStage: "multi_generational",
      }),
    ]);

    expect(groups).toEqual([
      {
        name: "Nate Baron",
        audienceCategory: "men",
        lifeStage: "multi_generational",
      },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].groupName).toBe("Nate Baron");
  });

  it("leaves target_year null — the Doc's 2026/2027 split is set in-app (R4)", () => {
    const { candidates } = buildSeedRows([entry({ leader: "Tim Boberg" })]);
    expect(candidates[0].targetYear).toBeNull();
  });

  it("seeds candidates as 'watching' with readiness flags off (the Doc asserts neither)", () => {
    const { candidates } = buildSeedRows([entry({ leader: "Tim Boberg" })]);
    expect(candidates[0].status).toBe("watching");
    expect(candidates[0].shepherdWilling).toBe(false);
    expect(candidates[0].needsSimilarStage).toBe(false);
  });
});

describe("buildCandidateNotes — provenance carried, not invented", () => {
  it("records the Doc's member count as provenance (no member-count column)", () => {
    const notes = buildCandidateNotes(
      entry({ leader: "Tim Boberg", memberCount: 13 })
    );
    expect(notes).toContain("13 members");
  });

  it("returns null when the Doc gives nothing to preserve", () => {
    const notes = buildCandidateNotes(entry({ memberCount: null }));
    expect(notes).toBeNull();
  });

  it("preserves a `(?)` uncertainty marker rather than resolving it", () => {
    const notes = buildCandidateNotes(
      entry({ leader: "Sandra Lea", memberCount: null, uncertain: true })
    );
    expect(notes).not.toBeNull();
    expect(notes!.toLowerCase()).toContain("unconfirmed");
  });

  it("preserves verbatim source caveats", () => {
    const notes = buildCandidateNotes(
      entry({ leader: "Jere and Jana Miller", caveats: ["(Vietmeier's?)"] })
    );
    expect(notes).toContain("(Vietmeier's?)");
  });
});

describe("buildSeedRows — candidate carries the composed notes", () => {
  it("populates candidate notes from the entry's provenance", () => {
    const { candidates } = buildSeedRows([
      entry({ leader: "Sandra Lea", memberCount: null, uncertain: true }),
    ]);
    expect(candidates[0].notes).toBe(
      buildCandidateNotes(
        entry({ leader: "Sandra Lea", memberCount: null, uncertain: true })
      )
    );
  });
});

describe("renderMultiplicationSeedSql — idempotent, archive-safe inserts", () => {
  const sql = () =>
    renderMultiplicationSeedSql([
      entry({
        leader: "Nate Baron",
        audience: "men",
        lifeStage: "multi_generational",
      }),
    ]);

  it("guards the group insert so re-running does not duplicate it", () => {
    expect(sql()).toMatch(
      /insert into public\.groups[\s\S]*where not exists \(\s*select 1 from public\.groups where name = 'Nate Baron'/i
    );
  });

  it("guards the candidate insert on the one-active-per-group invariant", () => {
    // A re-run must not create a second active candidate for the group.
    expect(sql().toLowerCase()).toContain("archived_at is null");
    expect(sql()).toMatch(/insert into public\.multiplication_candidates/i);
  });

  it("never hard-deletes", () => {
    expect(sql().toLowerCase()).not.toMatch(/delete\s+from/);
  });

  it("leaves the markdown source untouched (renders SQL only)", () => {
    expect(sql()).not.toContain("LG_MULTIPLICATION_PLAN_2026");
  });
});

describe("renderMultiplicationSeedSql — faithful field rendering", () => {
  it("escapes apostrophes so caveats like (Vietmeier's?) stay valid SQL", () => {
    const out = renderMultiplicationSeedSql([
      entry({ leader: "Jere and Jana Miller", caveats: ["(Vietmeier's?)"] }),
    ]);
    expect(out).toContain("(Vietmeier''s?)");
    expect(out).not.toContain("(Vietmeier's?)");
  });

  it("renders the successor/leader-designate and meeting time", () => {
    const out = renderMultiplicationSeedSql([
      entry({
        leader: "Nate Baron",
        successor: "Tony L.",
        meetingTime: "during_the_day",
      }),
    ]);
    expect(out).toContain("'Tony L.'");
    expect(out).toContain(
      "'during_the_day'::public.multiplication_meeting_time"
    );
  });

  it("renders null meeting time when the Doc gives none (no enum cast)", () => {
    const out = renderMultiplicationSeedSql([entry({ leader: "Tim Boberg" })]);
    expect(out).not.toContain("::public.multiplication_meeting_time");
  });

  // ADR 0022: the Doc's count now seeds the structured manual_member_count
  // column, not just the provenance note, so seeded groups read Julian's
  // headcount instead of the (unseeded → 0) in-app roster.
  it("seeds the Doc's count into the manual_member_count column", () => {
    const { candidates } = buildSeedRows([
      entry({ leader: "George Kelly", memberCount: 9 }),
    ]);
    expect(candidates[0].manualMemberCount).toBe(9);

    const out = renderMultiplicationSeedSql([
      entry({ leader: "George Kelly", memberCount: 9 }),
    ]);
    expect(out).toContain("manual_member_count");
    expect(out).toMatch(/, 9\n/);
  });

  it("renders manual_member_count null when the Doc gives no count", () => {
    const { candidates } = buildSeedRows([
      entry({ leader: "Sandra Lea", memberCount: null }),
    ]);
    expect(candidates[0].manualMemberCount).toBeNull();
    const out = renderMultiplicationSeedSql([
      entry({ leader: "Sandra Lea", memberCount: null }),
    ]);
    expect(out).toMatch(/, null\n/);
  });
});

describe("MULTIPLICATION_SEED_ENTRIES — faithful transcription of the Doc", () => {
  const byLeader = (leader: string) => {
    const e = MULTIPLICATION_SEED_ENTRIES.find((x) => x.leader === leader);
    if (!e) throw new Error(`no seed entry for ${leader}`);
    return e;
  };

  it("extracts the successor/leader-designate from the Doc's second (Name)", () => {
    expect(byLeader("Mike Irizarry").successor).toBe("Jon H.");
    expect(byLeader("Nate Baron").successor).toBe("Tony L.");
    expect(byLeader("Diana Johnson").successor).toBe("Cindy Kessaris");
  });

  it("treats the Doc's (N) as a member count, never as a successor", () => {
    expect(byLeader("George Kelly").successor).toBeNull();
    expect(byLeader("George Kelly").memberCount).toBe(9);
  });

  it("does NOT seed the 'launch from scratch' interest-list people (out of scope)", () => {
    const leaders = MULTIPLICATION_SEED_ENTRIES.map((e) => e.leader);
    expect(leaders).not.toContain("Karl and Lori Asen");
    expect(leaders).not.toContain("Chad and Shannon Heimsoth");
  });

  it("carries the women's 6-vs-7 reconciliation mismatch into notes for every women's group", () => {
    const womensGroups = MULTIPLICATION_SEED_ENTRIES.filter(
      (e) => e.audience === "women"
    );
    expect(womensGroups.length).toBeGreaterThan(0);
    for (const e of womensGroups) {
      const notes = buildCandidateNotes(e);
      expect(notes ?? "").toMatch(/6 groups|seven/i);
    }
  });

  it("preserves the (?) marker on unconfirmed entries", () => {
    expect(byLeader("Sandra Lea").uncertain).toBe(true);
    expect(byLeader("Stephanie Hichox").uncertain).toBe(true);
  });

  it("preserves the meeting time the Doc records for retirement groups", () => {
    expect(byLeader("Carol Dembkowski").meetingTime).toBe("evening");
    expect(byLeader("Ray and Julie Herrick").meetingTime).toBe(
      "during_the_day"
    );
  });

  it("preserves an ambiguous life-stage label rather than silently remapping it", () => {
    const notes = buildCandidateNotes(byLeader("Dennis Rens"));
    expect(notes ?? "").toMatch(/young professional kids/i);
  });
});

describe("supabase/seed/multiplication_seed.sql — committed artifact stays in sync", () => {
  it("matches the rendered output of the seed module (no drift)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = fileURLToPath(
      new URL("../../../supabase/seed/multiplication_seed.sql", import.meta.url)
    );
    const onDisk = readFileSync(path, "utf8");
    expect(normalizeTextFixture(onDisk)).toBe(
      normalizeTextFixture(renderMultiplicationSeedFile())
    );
  });
});
