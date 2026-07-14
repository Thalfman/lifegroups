// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/admin/super-admin/permanent-delete-actions", () => ({
  superAdminPermanentDelete: vi.fn(),
  superAdminLoadPermanentDeletionTargets: vi.fn(),
  superAdminPermanentDeletePreflight: vi.fn(),
  superAdminRestoreTombstone: vi.fn(),
}));

import { PermanentDeleteCard } from "@/components/admin/permanent-delete-card";
import type { AccountDeletionRequestQueueState } from "@/components/admin/super-admin/console-data";
import type {
  PermanentDeletionTargetGroup,
  RecentTombstonesState,
} from "@/lib/supabase/permanent-deletion-reads";

const REQUEST = {
  id: "request-1",
  profileId: "profile-requester",
  requesterName: "Avery Requester",
  requesterEmail: "avery@example.com",
  reason: "Please remove my account.",
  status: "pending" as const,
  requestedAt: "2026-07-10T12:00:00.000Z",
};

const TARGETS: PermanentDeletionTargetGroup[] = [
  {
    entityType: "launch_scenario",
    label: "Launch scenario",
    pluralLabel: "Launch scenarios",
    items: [{ id: "scenario-1", label: "Current plan" }],
    status: "loaded",
  },
  {
    entityType: "profile",
    label: "Person",
    pluralLabel: "People",
    // The queue requester can sit outside the bounded general-purpose target
    // read. The hand-off must still add and select that profile.
    items: [],
    status: "empty",
  },
];

function renderCard(
  queue: AccountDeletionRequestQueueState,
  options: {
    targets?: PermanentDeletionTargetGroup[];
    tombstones?: RecentTombstonesState;
  } = {}
) {
  return render(
    <PermanentDeleteCard
      targets={options.targets ?? TARGETS}
      tombstones={options.tombstones ?? { status: "empty", tombstones: [] }}
      accountDeletionRequestQueue={queue}
    />
  );
}

afterEach(cleanup);

describe("PermanentDeleteCard account deletion request queue", () => {
  it("renders requester details and preloads the existing profile purge flow", async () => {
    const user = userEvent.setup();
    renderCard({ status: "loaded", requests: [REQUEST] });

    expect(screen.getByText("Avery Requester")).toBeTruthy();
    expect(screen.getByText("avery@example.com")).toBeTruthy();
    expect(screen.getByText("Please remove my account.")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "Review and purge Avery Requester",
      })
    );

    expect(
      (screen.getByLabelText("Record type") as HTMLSelectElement).value
    ).toBe("profile");
    expect((screen.getByLabelText("Record") as HTMLSelectElement).value).toBe(
      "profile-requester"
    );
    expect(
      screen.getByRole("option", {
        name: "Avery Requester <avery@example.com>",
      })
    ).toBeTruthy();
  });

  it("states when the successfully loaded queue is empty", () => {
    renderCard({ status: "empty" });

    expect(
      screen.getByText("No pending account deletion requests.")
    ).toBeTruthy();
  });

  it("shows an unavailable state without claiming the failed queue is empty", () => {
    renderCard({ status: "failed" });

    expect(
      screen.getByText(
        "Account deletion requests could not be loaded. Refresh this page to try again."
      )
    ).toBeTruthy();
    expect(
      screen.queryByText("No pending account deletion requests.")
    ).toBeNull();
  });
  it("disables deletion when the selected target list failed to load", () => {
    renderCard(
      { status: "empty" },
      {
        targets: [
          {
            entityType: "profile",
            label: "Person",
            pluralLabel: "People",
            status: "failed",
            items: [],
          },
        ],
      }
    );

    expect(
      screen.getByText(
        "People could not be loaded. Refresh this page to try again."
      )
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Check dependents",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Permanently delete",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("shows unavailable recovery without assuming an empty history", () => {
    renderCard(
      { status: "empty" },
      { tombstones: { status: "failed", tombstones: [] } }
    );

    expect(
      screen.getByText(
        "Deleted-record history could not be loaded. Refresh this page to try again; no recovery state is assumed."
      )
    ).toBeTruthy();
    expect(screen.queryByText("No deleted-record history yet.")).toBeNull();
  });

  it("marks a profile-erasure tombstone irreversible without a restore action", () => {
    renderCard(
      { status: "empty" },
      {
        tombstones: {
          status: "loaded",
          tombstones: [
            {
              id: "tombstone-1",
              entityType: "profile",
              tableName: "profiles",
              entityId: "profile-1",
              label: "Erased person",
              deletedAt: "2026-07-11T12:00:00.000Z",
              restoredAt: null,
              restorable: false,
            },
          ],
        },
      }
    );

    expect(screen.getByText("Irreversible records")).toBeTruthy();
    expect(
      screen.getByText(
        /this person's identifying data was permanently erased and cannot be restored/
      )
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });
  it("labels an already-restored history with no pending restore instead of irreversible", () => {
    renderCard(
      { status: "empty" },
      {
        tombstones: {
          status: "loaded",
          tombstones: [
            {
              id: "tombstone-2",
              entityType: "group",
              tableName: "groups",
              entityId: "group-1",
              label: "Restored group",
              deletedAt: "2026-07-11T12:00:00.000Z",
              restoredAt: "2026-07-11T13:00:00.000Z",
              restorable: true,
            },
          ],
        },
      }
    );
    expect(screen.getByText("No pending restores")).toBeTruthy();
    expect(screen.queryByText("Irreversible records")).toBeNull();
  });
});
