import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CareNotesSection } from "../care-notes-section";
import type { PrayerRequestsRow } from "@/types/database";

// Issue #474 (plan P2.3): read-only Prayer Request status chips on the
// per-leader Care detail page. Display only — no status writes exist here.
// These tests pin the acceptance criteria:
//
//   1. A non-open request ("answered" / "archived") shows its status chip.
//   2. An open request renders unchanged — no chip at all.
//
// Both prayer lists are covered: the OS-authored requests ABOUT this leader
// and the group-scoped requests this leader authored (AuthoredGroupNote).

function prayerRow(
  id: string,
  status: PrayerRequestsRow["status"]
): PrayerRequestsRow {
  return {
    id,
    author_profile_id: "00000000-0000-4000-8000-00000000000a",
    author_descriptor: null,
    subject_profile_id: "00000000-0000-4000-8000-00000000000b",
    subject_group_id: null,
    body: `Prayer body ${id}`,
    status,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
  };
}

function renderSection(
  prayerRequests: PrayerRequestsRow[],
  authoredGroupPrayerRequests: Parameters<
    typeof CareNotesSection
  >[0]["authoredGroupPrayerRequests"] = []
): string {
  return renderToStaticMarkup(
    <CareNotesSection
      subjectProfileId="00000000-0000-4000-8000-00000000000b"
      granted
      careNotes={[]}
      prayerRequests={prayerRequests}
      authoredGroupPrayerRequests={authoredGroupPrayerRequests}
    />
  );
}

describe("CareNotesSection prayer status chips (#474)", () => {
  it("shows an Answered chip on an answered request", () => {
    const html = renderSection([prayerRow("p1", "answered")]);
    expect(html).toContain("Answered");
  });

  it("shows an Archived chip on an archived request", () => {
    const html = renderSection([prayerRow("p1", "archived")]);
    expect(html).toContain("Archived");
  });

  it("renders open requests unchanged — no chip", () => {
    const html = renderSection([prayerRow("p1", "open")]);
    expect(html).toContain("Prayer body p1");
    expect(html).not.toContain("Answered");
    expect(html).not.toContain("Archived");
  });

  it("chips the authored group prayer list by status too", () => {
    const html = renderSection(
      [],
      [
        {
          id: "g1",
          body: "Group prayer g1",
          created_at: "2026-06-01T00:00:00Z",
          groupName: "Young Marrieds",
          status: "answered",
        },
        {
          id: "g2",
          body: "Group prayer g2",
          created_at: "2026-06-01T00:00:00Z",
          groupName: "Young Marrieds",
          status: "open",
        },
      ]
    );
    expect(html).toContain("Group prayer g1");
    expect(html).toContain("Answered");
    expect(html).not.toContain("Archived");
  });
});
