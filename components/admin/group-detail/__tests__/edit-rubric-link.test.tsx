import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EditRubricLink } from "@/components/admin/group-detail/edit-rubric-link";

// #776 OPP-8 / #785 — the outbound "Edit rubric" link. It targets the audited
// Settings rubric editor with the group-health return marker, and — only when
// the group was reached from setup — an `origin_setup` marker so the round trip
// keeps the Back-to-setup affordance.
describe("EditRubricLink", () => {
  it("links to the Settings rubric editor with the group + return marker", () => {
    const html = renderToStaticMarkup(<EditRubricLink groupId="g1" />);
    expect(html).toContain('id="edit-rubric-button"');
    expect(html).toContain(
      "/admin/settings?tab=care&amp;group=g1&amp;from=group-health"
    );
    expect(html).not.toContain("origin_setup");
  });

  it("carries origin_setup=1 through the round trip when reached from setup", () => {
    const html = renderToStaticMarkup(
      <EditRubricLink groupId="g1" fromSetup />
    );
    expect(html).toContain(
      "/admin/settings?tab=care&amp;group=g1&amp;origin_setup=1&amp;from=group-health"
    );
  });
});
