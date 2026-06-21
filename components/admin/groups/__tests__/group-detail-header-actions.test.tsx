// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupsRow } from "@/types/database";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Stub the (already-tested) list menu + editor drawer so this test focuses on
// the header's own wiring: the menu's Edit opens the shared drawer in edit mode.
vi.mock("@/components/admin/groups/group-actions-menu", () => ({
  GroupActionsMenu: (props: {
    group: GroupsRow;
    isArchived: boolean;
    isSuperAdmin: boolean;
    onEdit: (g: GroupsRow) => void;
  }) => (
    <button type="button" onClick={() => props.onEdit(props.group)}>
      {`menu archived=${props.isArchived} sa=${props.isSuperAdmin}`}
    </button>
  ),
}));

vi.mock("@/components/admin/groups/group-editor-drawer", () => ({
  GroupEditorDrawer: (props: {
    editor: { mode: string; group?: GroupsRow } | null;
  }) => (
    <div
      data-testid="editor"
      data-mode={props.editor?.mode ?? "closed"}
      data-group={props.editor?.group?.id ?? ""}
    />
  ),
}));

import { GroupDetailHeaderActions } from "@/components/admin/groups/group-detail-header-actions";

const GROUP = {
  id: "grp-1",
  name: "Westside",
  lifecycle_status: "active",
} as unknown as GroupsRow;

afterEach(cleanup);

// #776 Phase 1 (OPP-2) — the group-detail header actions.
describe("GroupDetailHeaderActions", () => {
  it("opens the editor drawer in edit mode for this group", async () => {
    const user = userEvent.setup();
    render(
      <GroupDetailHeaderActions
        group={GROUP}
        groupTypes={[]}
        defaultCapacity={12}
        isSuperAdmin
      />
    );
    expect(screen.getByTestId("editor").getAttribute("data-mode")).toBe(
      "closed"
    );

    await user.click(screen.getByRole("button"));

    const editor = screen.getByTestId("editor");
    expect(editor.getAttribute("data-mode")).toBe("edit");
    expect(editor.getAttribute("data-group")).toBe("grp-1");
  });

  it("marks an archived group's menu as archived and carries the super-admin flag", () => {
    render(
      <GroupDetailHeaderActions
        group={
          { ...GROUP, lifecycle_status: "archived" } as unknown as GroupsRow
        }
        groupTypes={[]}
        defaultCapacity={null}
        isSuperAdmin={false}
      />
    );
    expect(
      screen.getByRole("button", { name: "menu archived=true sa=false" })
    ).toBeTruthy();
  });
});
