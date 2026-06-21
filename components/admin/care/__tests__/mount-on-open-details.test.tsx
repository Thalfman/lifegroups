import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MountOnOpenDetails } from "@/components/admin/care/mount-on-open-details";

// #777 WS3 — the mount-on-first-open disclosure used at all three Care accordion
// levels. The summary is always rendered (the server-rendered roll-up); the
// children are gated until the native <details> is first opened. The closed
// state is what renderToStaticMarkup captures, so it pins the gating contract
// here; the open-then-mount path is exercised end-to-end in the real-browser
// care-actions a11y spec (jsdom's <details> toggle is unreliable).
describe("MountOnOpenDetails", () => {
  it("renders the summary but withholds children while closed", () => {
    const html = renderToStaticMarkup(
      <MountOnOpenDetails summary={<span>Roll-up</span>}>
        <p>Expensive body</p>
      </MountOnOpenDetails>
    );

    expect(html).toContain("Roll-up");
    expect(html).not.toContain("Expensive body");
  });

  it("keeps the native <details>/<summary> disclosure markup", () => {
    const html = renderToStaticMarkup(
      <MountOnOpenDetails
        detailsClassName="pane"
        summaryClassName="lg-sac-summary"
        bodyClassName="body"
        summary={<span>Roll-up</span>}
      >
        <p>Expensive body</p>
      </MountOnOpenDetails>
    );

    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain('class="lg-sac-summary"');
  });
});
