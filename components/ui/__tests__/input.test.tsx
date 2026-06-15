import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input, Textarea } from "@/components/ui/input";
import { fieldInputClassName } from "@/components/admin/forms/field-styles";

describe("Input", () => {
  it("renders the shared field-input look and forwards native props", () => {
    const html = renderToStaticMarkup(
      <Input name="title" placeholder="Reach out" required />
    );

    expect(html).toContain(`name="title"`);
    expect(html).toContain(`placeholder="Reach out"`);
    expect(html).toContain("required");
    // Composed over the shared field-styles base.
    expect(html).toContain("rounded-sm");
    expect(html).toContain("border-line");
  });

  it("merges a caller className over the shared base", () => {
    const html = renderToStaticMarkup(<Input className="max-w-24" />);
    expect(html).toContain("max-w-24");
    expect(html).toContain("bg-surface");
  });

  it("uses the canonical field-input class string", () => {
    const html = renderToStaticMarkup(<Input />);
    for (const token of fieldInputClassName.split(" ")) {
      expect(html).toContain(token);
    }
  });
});

describe("Textarea", () => {
  it("renders a textarea sharing the field-input look", () => {
    const html = renderToStaticMarkup(
      <Textarea name="note" className="min-h-[60px] resize-y" />
    );
    expect(html).toContain("<textarea");
    expect(html).toContain(`name="note"`);
    expect(html).toContain("min-h-[60px]");
    expect(html).toContain("resize-y");
  });
});
