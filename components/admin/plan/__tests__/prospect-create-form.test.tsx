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
