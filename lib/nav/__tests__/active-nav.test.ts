import { describe, expect, it } from "vitest";
import {
  NAV_ALIAS_TO_CANONICAL,
  isActiveNavHref,
  resolveCanonicalPath,
} from "@/lib/nav/active-nav";
import { ADMIN_AREAS } from "@/lib/auth/roles";

// The six-area spine drives both the visual highlight and aria-current. The
// resolver must mark exactly one area active for any path that belongs to the
// spine — including frozen alias URLs that own no nav entry of their own.
const AREA_HREFS = ADMIN_AREAS.map((a) => a.href);

describe("resolveCanonicalPath", () => {
  it("resolves each frozen alias to its owning canonical area href", () => {
    expect(resolveCanonicalPath("/admin/shepherd-care")).toBe("/admin/care");
    expect(resolveCanonicalPath("/admin/launch-planning")).toBe(
      "/admin/planning"
    );
    expect(resolveCanonicalPath("/admin/calendar")).toBe("/admin/planning");
    expect(resolveCanonicalPath("/admin/follow-ups")).toBe("/admin/care");
    expect(resolveCanonicalPath("/admin/leader-pipeline")).toBe(
      "/admin/people"
    );
    expect(resolveCanonicalPath("/admin/group-health")).toBe("/admin/groups");
  });

  it("passes a non-alias path through unchanged (resolves to itself)", () => {
    expect(resolveCanonicalPath("/admin/groups")).toBe("/admin/groups");
    expect(resolveCanonicalPath("/admin")).toBe("/admin");
    expect(resolveCanonicalPath("/admin/groups/abc-123")).toBe(
      "/admin/groups/abc-123"
    );
    expect(resolveCanonicalPath("/over-shepherd")).toBe("/over-shepherd");
  });

  it("maps every alias to a real canonical area href", () => {
    for (const canonical of Object.values(NAV_ALIAS_TO_CANONICAL)) {
      expect(AREA_HREFS).toContain(canonical);
    }
  });
});

describe("isActiveNavHref", () => {
  it("keeps the /admin exact-match rule: Home never lights for deeper routes", () => {
    expect(isActiveNavHref("/admin", "/admin")).toBe(true);
    expect(isActiveNavHref("/admin/groups", "/admin")).toBe(false);
    expect(isActiveNavHref("/admin/care", "/admin")).toBe(false);
    // An alias under /admin must not light Home either.
    expect(isActiveNavHref("/admin/shepherd-care", "/admin")).toBe(false);
  });

  it("matches a canonical area on its own path and nested children", () => {
    expect(isActiveNavHref("/admin/groups", "/admin/groups")).toBe(true);
    expect(isActiveNavHref("/admin/groups/abc-123", "/admin/groups")).toBe(
      true
    );
  });

  it("does not treat a sibling prefix as active", () => {
    // /admin/people must not match /admin/peopleX — the boundary is the slash.
    expect(isActiveNavHref("/admin/people-archive", "/admin/people")).toBe(
      false
    );
  });

  it("marks a frozen alias active under its owning canonical area", () => {
    expect(isActiveNavHref("/admin/shepherd-care", "/admin/care")).toBe(true);
    expect(isActiveNavHref("/admin/follow-ups", "/admin/care")).toBe(true);
    expect(isActiveNavHref("/admin/launch-planning", "/admin/planning")).toBe(
      true
    );
    expect(isActiveNavHref("/admin/calendar", "/admin/planning")).toBe(true);
    expect(isActiveNavHref("/admin/leader-pipeline", "/admin/people")).toBe(
      true
    );
    expect(isActiveNavHref("/admin/group-health", "/admin/groups")).toBe(true);
  });

  it("an alias does NOT light an area other than its owner", () => {
    // shepherd-care belongs to Care, so Groups/People/Planning stay inactive.
    expect(isActiveNavHref("/admin/shepherd-care", "/admin/groups")).toBe(
      false
    );
    expect(isActiveNavHref("/admin/shepherd-care", "/admin/people")).toBe(
      false
    );
    expect(isActiveNavHref("/admin/shepherd-care", "/admin/planning")).toBe(
      false
    );
  });

  it("resolves exactly one nav area active for each alias URL", () => {
    for (const alias of Object.keys(NAV_ALIAS_TO_CANONICAL)) {
      const active = AREA_HREFS.filter((href) => isActiveNavHref(alias, href));
      expect(
        active,
        `alias ${alias} should mark exactly one area`
      ).toHaveLength(1);
      expect(active[0]).toBe(NAV_ALIAS_TO_CANONICAL[alias]);
    }
  });

  it("resolves exactly one nav area active for each canonical area path", () => {
    for (const href of AREA_HREFS) {
      const active = AREA_HREFS.filter((h) => isActiveNavHref(href, h));
      expect(active, `path ${href} should mark exactly one area`).toHaveLength(
        1
      );
      expect(active[0]).toBe(href);
    }
  });
});
