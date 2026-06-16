import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BackToSetupLink,
  isFromSetup,
} from "@/components/lg/admin/back-to-setup-link";

// ADR 0027 — the reusable "← Back to setup" affordance and its from=setup reader.
describe("isFromSetup (#646)", () => {
  it("is true only for the setup marker, across string and array params", () => {
    expect(isFromSetup("setup")).toBe(true);
    expect(isFromSetup(["setup", "other"])).toBe(true);
    expect(isFromSetup("nope")).toBe(false);
    expect(isFromSetup(undefined)).toBe(false);
    expect(isFromSetup([])).toBe(false);
  });
});

describe("BackToSetupLink (#646)", () => {
  it("links back to Home carrying the from=setup return marker", () => {
    const html = renderToStaticMarkup(<BackToSetupLink />);
    expect(html).toContain('href="/admin?from=setup"');
    expect(html).toContain("← Back to setup");
  });
});
