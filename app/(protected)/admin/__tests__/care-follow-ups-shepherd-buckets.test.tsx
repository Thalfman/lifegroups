import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildCareArea, type BuildCareAreaInput } from "@/lib/admin/care-area";
import { CareItemList } from "@/components/admin/care/care-item-list";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-directory-reads";
import type {
  CareFollowUpCompletedRow,
  CareFollowUpDashboardRow,
} from "@/lib/supabase/shepherd-care-follow-up-reads";

// #334 P1 — "Keep shepherd-care follow-ups visible". The re-key folded the old
// Due Soon / Completed Care tabs into a single Follow-ups tab. But that tab's
// generic AdminFollowUpsShell reads ONLY the `follow_ups` table, never
// `shepherd_care_follow_ups`. The fix restores the shepherd-care buckets
// (area.dueSoon / area.completed, backed by shepherd_care_follow_ups) as a
// labelled, actionable section of the Follow-ups tab so:
//   • a care follow-up due soon but NOT overdue, and
//   • a recently COMPLETED care follow-up
// still have a list to act from under /admin/care (the Dashboard only counts the
// overdue ones — it is not an actionable list for these rows).
//
// Two invariants are pinned here:
//   1. Those buckets render as actionable CareItemList rows (person + explicit
//      verb action linking into the leader detail page — "Resolve follow-up"
//      for outstanding rows, "View follow-up" for completed ones).
//   2. The Follow-ups tab in care/page.tsx actually wires area.dueSoon /
//      area.completed into CareItemList alongside the generic shell — so the
//      data that is already loaded can't be silently dropped again.

const TODAY = "2026-06-03";

function entry(
  profileId: string,
  careProfileId: string,
  fullName: string
): ShepherdCareDirectoryEntry {
  return {
    profile: {
      id: profileId,
      full_name: fullName,
      email: `${profileId}@example.com`,
      role: "leader",
      status: "active",
    },
    care: {
      id: careProfileId,
      shepherd_profile_id: profileId,
      current_status: "doing_well",
      last_contact_at: null,
      next_touchpoint_due: null,
      archived_at: null,
      created_at: `${TODAY}T00:00:00Z`,
      updated_at: `${TODAY}T00:00:00Z`,
    },
    needs_attention: false,
  };
}

function areaInput(): BuildCareAreaInput {
  const entries = [
    entry("leader-soon", "cp-soon", "Sue DueSoon"),
    entry("leader-done", "cp-done", "Dan Completed"),
  ];
  // A care follow-up due in 3 days — due SOON but NOT overdue. This is exactly
  // the row the generic shell's "overdue" / Dashboard's overdue count never show.
  const outstandingFollowUps: CareFollowUpDashboardRow[] = [
    {
      id: "fu-soon",
      care_profile_id: "cp-soon",
      status: "open",
      due_date: "2026-06-06",
    },
  ];
  // A recently completed care follow-up — the generic shell never lists these.
  const completedFollowUps: CareFollowUpCompletedRow[] = [
    {
      id: "fu-done",
      care_profile_id: "cp-done",
      status: "done",
      due_date: "2026-05-20",
      completed_at: "2026-05-21T12:00:00Z",
    },
  ];
  return {
    entries,
    attentionQueue: [],
    outstandingFollowUps,
    completedFollowUps,
    recentInteractions: [],
    ownerNameByShepherdId: new Map(),
    groupNameByShepherdId: new Map(),
    todayIso: TODAY,
  };
}

describe("Shepherd-care follow-up buckets stay actionable under /admin/care (#334 P1)", () => {
  it("renders a due-soon-not-overdue care follow-up as an actionable row", () => {
    const { dueSoon } = buildCareArea(areaInput());
    // Exactly the non-overdue, due-soon row survives.
    expect(dueSoon).toHaveLength(1);
    expect(dueSoon[0]!.dueTone).toBe("soon"); // soon, not overdue
    expect(dueSoon[0]!.reason).toBe("Follow-up due soon");

    const html = renderToStaticMarkup(
      <CareItemList
        items={dueSoon}
        emptyTitle="No care follow-ups due soon"
        emptyDescription="No care follow-ups are overdue or due in the next week."
      />
    );
    // The person + an explicit verb action linking into the leader detail page.
    // An outstanding (due-soon/overdue) follow-up routes to the actionable
    // "Resolve follow-up" label (#332, care-next-action); only the already-done
    // completed bucket reads "View follow-up".
    expect(html).toContain("Sue DueSoon");
    expect(html).toContain("Resolve follow-up");
    expect(html).toContain("/admin/shepherd-care/leader-soon?tab=follow-ups");
    // It is the actual list, not the empty state.
    expect(html).not.toContain("No care follow-ups due soon");
  });

  it("renders a recently completed care follow-up as an actionable row", () => {
    const { completed } = buildCareArea(areaInput());
    expect(completed).toHaveLength(1);
    expect(completed[0]!.reason).toBe("Follow-up completed");

    const html = renderToStaticMarkup(
      <CareItemList
        items={completed}
        emptyTitle="No completed care follow-ups yet"
        emptyDescription="Care follow-ups you mark complete land here — not items from the general follow-up queue below."
      />
    );
    expect(html).toContain("Dan Completed");
    expect(html).toContain("View follow-up");
    expect(html).toContain("/admin/shepherd-care/leader-done?tab=follow-ups");
    expect(html).not.toContain("No completed care follow-ups yet");
  });
});

describe("The Follow-ups tab wires the shepherd-care buckets into the page (#334 P1)", () => {
  // Source-level guard: the Follow-ups tab must keep rendering area.dueSoon /
  // area.completed via CareItemList AND keep the generic AdminFollowUpsShell, so
  // the two follow-up sources both stay present and distinguishable.
  const CARE_WORKSPACE = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../components/admin/care/care-workspace.tsx",
        import.meta.url
      )
    ),
    "utf8"
  );

  it("feeds area.dueSoon and area.completed into CareItemList", () => {
    expect(CARE_WORKSPACE).toMatch(/items=\{area\.dueSoon\}/);
    expect(CARE_WORKSPACE).toMatch(/items=\{area\.completed\}/);
  });

  it("keeps the generic follow_ups queue (AdminFollowUpsShell) too", () => {
    expect(CARE_WORKSPACE).toContain("<AdminFollowUpsShell");
  });

  it("labels the shepherd-care section so the two sources are distinguishable", () => {
    // #479 — the eyebrow says whose work this is in CONTEXT.md vocabulary
    // ("Shepherd" in user-facing copy, per ADR 0025).
    expect(CARE_WORKSPACE).toContain('eyebrow="Shepherd care"');
  });

  it("scopes the bucket labels to care follow-ups so they can't read as a global done count", () => {
    // The buckets must name themselves "care follow-ups" rather than a bare
    // "Completed (n)" / "Due soon (n)" that reads as a global count and
    // contradicts the generic queue's Done section right below.
    expect(CARE_WORKSPACE).toContain("Completed care follow-ups (");
    expect(CARE_WORKSPACE).toContain("Due-soon care follow-ups (");
    expect(CARE_WORKSPACE).not.toMatch(
      />\s*Completed \(\{area\.completed\.length\}\)/
    );
  });
});

describe("The two follow-up queues read as a legible split (#479, copy only)", () => {
  const CARE_WORKSPACE = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../components/admin/care/care-workspace.tsx",
        import.meta.url
      )
    ),
    "utf8"
  );
  const FOLLOW_UPS_SHELL = readFileSync(
    fileURLToPath(
      new URL(
        "../../../../components/admin/follow-ups/follow-ups-shell.tsx",
        import.meta.url
      )
    ),
    "utf8"
  );

  it("the care section carries a subject-first heading", () => {
    expect(CARE_WORKSPACE).toContain(
      'title="Care follow-ups: about your shepherds"'
    );
  });

  it("the general queue carries a subject-first heading", () => {
    expect(FOLLOW_UPS_SHELL).toContain(
      'title="General follow-ups: groups and tasks"'
    );
  });

  it("the tab opens with a one-line lede stating the split", () => {
    expect(CARE_WORKSPACE).toContain("Two queues live here");
    expect(CARE_WORKSPACE).toContain(
      "care follow-ups are about your shepherds"
    );
    expect(CARE_WORKSPACE).toContain(
      "general follow-ups cover groups and tasks"
    );
  });

  it("shows two labelled open counts (care vs general), not one combined badge", () => {
    // The figures come from the shared pure helper (so the definition of "open"
    // and its failed-read suppression stay tested in
    // lib/admin/__tests__/care-area.test.ts) and render as two labelled figures
    // in the panel — never a single merged number that contradicts the
    // "counts won't match" copy (#644).
    expect(CARE_WORKSPACE).toContain("openFollowUpCountsByQueue({");
    expect(CARE_WORKSPACE).toContain("openFollowUpCounts.care");
    expect(CARE_WORKSPACE).toContain("openFollowUpCounts.general");
    // The old combined-count badge wiring is gone.
    expect(CARE_WORKSPACE).not.toContain("combinedOpenFollowUpCount");
    expect(CARE_WORKSPACE).not.toContain("count: openFollowUpCount");
  });
});
