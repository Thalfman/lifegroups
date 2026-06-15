import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Select } from "@/components/ui/select";
import { fieldSelectClassName } from "@/components/admin/forms/field-styles";

describe("Select", () => {
  it("renders options and forwards native props", () => {
    const html = renderToStaticMarkup(
      <Select name="priority" defaultValue="normal">
        <option value="low">Low</option>
        <option value="normal">Normal</option>
      </Select>
    );

    expect(html).toContain(`name="priority"`);
    expect(html).toContain("Low");
    expect(html).toContain("Normal");
  });

  it("uses the shared field-select look and merges a caller className", () => {
    const html = renderToStaticMarkup(
      <Select className="max-w-36">
        <option value="">—</option>
      </Select>
    );
    expect(html).toContain("max-w-36");
    for (const token of fieldSelectClassName.split(" ")) {
      expect(html).toContain(token);
    }
  });
});
