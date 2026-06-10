import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The directory's row actions call usePathname() and the people / super-admin
// server actions. These tests assert render-time structure only (which role
// sections appear, and in what order), so stub the router + actions — none of
// them run under static markup.
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/people" }));
vi.mock("@/app/(protected)/admin/people/actions", () => ({
  adminChangeLeaderRole: vi.fn(),
  adminDeactivateMember: vi.fn(),
  adminDeactivateProfile: vi.fn(),
}));
vi.mock("@/app/(protected)/admin/super-admin/permanent-delete-actions", () => ({
  superAdminInlineDelete: vi.fn(),
  superAdminPermanentDeletePreflight: vi.fn(),
}));

import { PeopleDirectory } from "@/components/admin/people-directory";
import { profile } from "@/lib/dashboard/group-fixtures";
import type { ProfilesRow } from "@/types/database";

// One active profile per rung of the oversight ladder.
function ladderProfiles(): ProfilesRow[] {
  return [
    profile({ id: "p-lead", full_name: "Lena Leader", role: "leader" }),
    profile({ id: "p-co", full_name: "Cody Colead", role: "co_leader" }),
    profile({ id: "p-os", full_name: "Otis Shepherd", role: "over_shepherd" }),
    profile({ id: "p-ma", full_name: "Mia Admin", role: "ministry_admin" }),
  ];
}

function renderDirectory(
  profiles: ProfilesRow[],
  overrides: Partial<Parameters<typeof PeopleDirectory>[0]> = {}
): string {
  return renderToStaticMarkup(
    <PeopleDirectory
      profiles={profiles}
      members={[]}
      groups={[]}
      groupLeaders={[]}
      memberships={[]}
      currentActorProfileId="p-actor"
      needsContactProfileIds={new Set()}
      errors={{
        profiles: null,
        members: null,
        leaders: null,
        memberships: null,
      }}
      {...overrides}
    />
  );
}

// The initial render (Everyone scope, Active status) is what static markup can
// assert; scope/filter interactions stay with the Playwright a11y suite.
function sectionHeadings(html: string): string[] {
  return [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);
}

describe("PeopleDirectory role sections", () => {
  it("renders one section per role, ordered down the oversight ladder", () => {
    const html = renderDirectory(ladderProfiles());
    expect(sectionHeadings(html)).toEqual([
      "Ministry Admins",
      "Over-Shepherds",
      "Leaders",
      "Co-Leaders",
      "Members",
    ]);
  });

  it("omits a role section nobody is in", () => {
    const html = renderDirectory(
      ladderProfiles().filter((p) => p.role !== "over_shepherd")
    );
    expect(sectionHeadings(html)).toEqual([
      "Ministry Admins",
      "Leaders",
      "Co-Leaders",
      "Members",
    ]);
  });

  it("collapses to one aggregate empty section when no profiles match", () => {
    const html = renderDirectory([]);
    expect(sectionHeadings(html)).toEqual(["Leaders and oversight", "Members"]);
    expect(html).toContain("No leaders or oversight roles match");
  });

  it("collapses to one aggregate section carrying the read error", () => {
    const html = renderDirectory(ladderProfiles(), {
      errors: {
        profiles: "boom",
        members: null,
        leaders: null,
        memberships: null,
      },
    });
    expect(sectionHeadings(html)).toEqual(["Leaders and oversight", "Members"]);
    expect(html).toContain("load profiles: boom");
    expect(html).not.toContain("Ministry Admins");
  });
});
