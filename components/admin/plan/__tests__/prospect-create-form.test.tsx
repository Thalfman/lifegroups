import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CategoryOptionsByAudience } from "@/lib/supabase/group-categories-reads";

// The form binds a "use server" action; stub the module so static rendering
// never pulls server-only deps (the markup never invokes the action anyway).
vi.mock("@/app/(protected)/admin/plan/actions", () => ({
  adminCreateProspect: vi.fn(),
}));

import { ProspectCreateForm } from "@/components/admin/plan/prospect-create-form";

// Built inline (rather than imported from the reads module) to keep the test
// free of any server-only read-layer imports.
const OPTIONS: CategoryOptionsByAudience = { men: [], women: [], mixed: [] };

describe("ProspectCreateForm — Full name accessibility wiring", () => {
  it("marks Full name required and describes it by a live error region", () => {
    const html = renderToStaticMarkup(
      <ProspectCreateForm categoryOptionsByAudience={OPTIONS} />
    );

    // The required field is wired for assistive tech...
    expect(html).toContain('id="prospect-full_name"');
    expect(html).toContain("required");
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('aria-describedby="prospect-full_name-error"');

    // ...and the live error region it points to exists (hidden until a failed
    // validation populates it), so role="alert" has somewhere to announce.
    expect(html).toContain('id="prospect-full_name-error"');
    expect(html).toContain('role="alert"');
  });

  it("disables Add prospect until a full name is entered", () => {
    const html = renderToStaticMarkup(
      <ProspectCreateForm categoryOptionsByAudience={OPTIONS} />
    );

    expect(html).toContain("Enter a full name to enable Add prospect.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add prospect<\/button>/);
  });
});

describe("ProspectCreateForm — one group-type box + add-a-group shortcut", () => {
  const WITH_CELLS: CategoryOptionsByAudience = {
    men: [{ id: "m1", label: "Multi-generational" }],
    women: [{ id: "w1", label: "Young families" }],
    mixed: [],
  };

  it("posts the desired cell as two hidden fields derived from the one select", () => {
    const html = renderToStaticMarkup(
      <ProspectCreateForm categoryOptionsByAudience={WITH_CELLS} />
    );

    // ONE combined select (no separate top-type + category dropdowns)…
    expect(html).toContain('id="prospect-desired_cell"');
    expect(html).not.toContain('name="desired_audience_category"\n');
    // …backed by the two hidden fields the unchanged action/RPC still read.
    expect(html).toContain('type="hidden"');
    expect(html).toContain('name="desired_audience_category"');
    expect(html).toContain('name="desired_category_id"');
    // The cells are grouped by top type via <optgroup>, encoding audience:id.
    expect(html).toContain('value="men:m1"');
    expect(html).toContain('value="women:w1"');
  });

  it("offers a shortcut into Settings › Groups that returns to the funnel", () => {
    const html = renderToStaticMarkup(
      <ProspectCreateForm categoryOptionsByAudience={WITH_CELLS} />
    );
    expect(html).toContain("+ Add a group type");
    expect(html).toContain(
      "/admin/settings?tab=groups&amp;from=plan&amp;add=1"
    );
  });

  it("disables the group-type box and names the empty state with no cells", () => {
    const html = renderToStaticMarkup(
      <ProspectCreateForm categoryOptionsByAudience={OPTIONS} />
    );
    expect(html).toMatch(/<select[^>]*id="prospect-desired_cell"[^>]*disabled/);
    expect(html).toContain("No group types yet");
  });
});
