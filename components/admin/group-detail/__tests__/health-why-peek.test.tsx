// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { HealthWhyPeek } from "@/components/admin/group-detail/health-why-peek";

afterEach(cleanup);

// #781 OPP-8 — the read-only "why?" peek + deep link.
describe("HealthWhyPeek", () => {
  it("explains the governing bands and links to the Settings editor via the return round trip", async () => {
    const user = userEvent.setup();
    render(<HealthWhyPeek groupId="g1" />);

    await user.click(
      screen.getByRole("button", {
        name: "Why this grade? Show the governing Group-Health rubric",
      })
    );

    expect(await screen.findByText("How this grade is set")).toBeTruthy();
    expect(screen.getByText("A · 90% and up")).toBeTruthy();
    expect(screen.getByText("F · below 60%")).toBeTruthy();

    // The deep link reuses the Phase-1 return convention (from=group-health) and
    // scopes the editor to this group.
    const link = screen.getByRole("link", {
      name: "Edit rubric in Settings →",
    });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("/admin/settings?tab=care");
    expect(href).toContain("group=g1");
    expect(href).toContain("from=group-health");
    expect(href).not.toContain("origin_setup");
  });

  it("carries the setup origin through the round trip when reached from setup", async () => {
    const user = userEvent.setup();
    render(<HealthWhyPeek groupId="g1" fromSetup />);

    await user.click(
      screen.getByRole("button", {
        name: "Why this grade? Show the governing Group-Health rubric",
      })
    );
    const link = screen.getByRole("link", {
      name: "Edit rubric in Settings →",
    });
    expect(link.getAttribute("href")).toContain("origin_setup=1");
  });
});
