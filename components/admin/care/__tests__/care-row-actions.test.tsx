// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// Capture the shared host's openAction so we can assert the menu hands it the
// right { entity, action } without mounting the whole ContextualActionProvider.
const openAction = vi.fn();
vi.mock("@/components/lg/admin/contextual-action-provider", () => ({
  useContextualAction: () => ({ openAction }),
}));

import { CareLeaderActionsMenu } from "@/components/admin/care/care-row-actions";
import { NotesFeedShell } from "@/components/admin/care/notes-feed-shell";
import type { CareFeedItem } from "@/lib/admin/care-note-feed";

afterEach(() => {
  cleanup();
  openAction.mockReset();
});

// #776 Phase 1 (OPP-1) — the per-leader contextual action menu.
describe("CareLeaderActionsMenu", () => {
  it("opens the chosen action for the leader entity", async () => {
    const user = userEvent.setup();
    render(
      <CareLeaderActionsMenu
        leaderProfileId="ldr-1"
        leaderName="Sam Carter"
        viewerRole="ministry_admin"
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Care actions for Sam Carter" })
    );
    await user.click(await screen.findByText("Add care note"));
    expect(openAction).toHaveBeenCalledWith({
      entity: { kind: "leader", id: "ldr-1", label: "Sam Carter" },
      action: expect.objectContaining({
        id: "add_care_note",
        body: "care_note_writer",
        model: "drawer",
      }),
    });
  });

  it("renders nothing for a non-admin role (no actions resolve)", () => {
    render(
      <CareLeaderActionsMenu
        leaderProfileId="ldr-1"
        leaderName="Sam Carter"
        viewerRole="leader"
      />
    );
    expect(screen.queryByRole("button", { name: /Care actions/ })).toBeNull();
  });
});

// The feed only offers the menu on leader-subject items — a group note has no
// per-leader care lane to act on here.
describe("NotesFeedShell leader-vs-group menu gating", () => {
  function item(overrides: Partial<CareFeedItem>): CareFeedItem {
    return {
      kind: "care_note",
      id: "n1",
      body: "note body",
      occurredAt: "2026-06-01T00:00:00Z",
      recordedAt: "2026-06-01T00:00:00Z",
      authorProfileId: "a1",
      authorName: "Author",
      viewerAuthored: false,
      subjectKind: "leader",
      subjectId: "ldr-1",
      subjectName: "Leader One",
      ...overrides,
    };
  }

  it("shows the menu on a leader-subject item, not a group-subject item", () => {
    render(
      <NotesFeedShell
        items={[
          item({ id: "leader-note", subjectKind: "leader" }),
          item({
            id: "group-note",
            subjectKind: "group",
            subjectId: "grp-1",
            subjectName: "Westside Group",
          }),
        ]}
        sealedSummary={[]}
        feedAvailable
        sealedAvailable
        namesAvailable
        viewerRole="ministry_admin"
      />
    );
    expect(
      screen.getByRole("button", { name: "Care actions for Leader One" })
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Care actions for Westside Group" })
    ).toBeNull();
  });

  it("shows no menus at all without a viewerRole (host-less context)", () => {
    render(
      <NotesFeedShell
        items={[item({ id: "leader-note" })]}
        sealedSummary={[]}
        feedAvailable
        sealedAvailable
        namesAvailable
      />
    );
    expect(screen.queryByRole("button", { name: /Care actions/ })).toBeNull();
  });
});
