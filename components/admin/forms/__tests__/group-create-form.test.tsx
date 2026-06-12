import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CategoriesByAudience } from "@/components/admin/forms/group-category-options";

vi.mock("@/app/(protected)/admin/groups/actions", () => ({
  adminCreateGroup: vi.fn(),
}));

import { GroupCreateForm } from "@/components/admin/forms/group-create-form";

const CATEGORIES: CategoriesByAudience = { men: [], women: [], mixed: [] };

describe("GroupCreateForm", () => {
  it("disables Create group until a group name is entered", () => {
    const html = renderToStaticMarkup(
      <GroupCreateForm defaultCapacity={12} categoriesByAudience={CATEGORIES} />
    );

    expect(html).toContain("Enter a group name to enable Create group.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create group<\/button>/);
  });
});
