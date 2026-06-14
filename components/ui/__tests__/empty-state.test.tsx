import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/ui/empty-state";

describe("EmptyState", () => {
  it("renders the card variant with a dashed border and optional description/action", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="No follow-ups yet"
        description="Use Add follow-up to create the first one."
        action={<button>Add follow-up</button>}
      />
    );

    expect(html).toContain("border-dashed");
    expect(html).toContain("No follow-ups yet");
    expect(html).toContain("Use Add follow-up to create the first one.");
    expect(html).toContain("Add follow-up");
  });

  it("renders the inline variant as a muted line with caller-supplied padding", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        variant="inline"
        className="py-5"
        title="No interactions logged yet."
      />
    );

    expect(html).toContain("No interactions logged yet.");
    expect(html).toContain("py-5");
    // Inline variant is not the bordered card.
    expect(html).not.toContain("border-dashed");
  });
});
