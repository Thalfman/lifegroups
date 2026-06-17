// @vitest-environment jsdom
import { useRef } from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupHealthOverviewRow } from "@/lib/admin/group-health-read";

// The editor body calls router.refresh on save; stub the router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// adminSetGroupHealthRatings is held pending for the whole test so the drawer
// stays in its in-flight state; the recompute action is a no-op stub.
const adminSetGroupHealthRatings = vi.fn(
  (_prev: unknown, _formData: FormData) =>
    new Promise<never>(() => {
      // never resolves within the test — keeps `pending` true
    })
);
vi.mock("@/app/(protected)/admin/group-health/actions", () => ({
  adminSetGroupHealthRatings: (prev: unknown, formData: FormData) =>
    adminSetGroupHealthRatings(prev, formData),
  adminRecomputeGroupHealthAssessment: vi.fn(),
}));

import { GroupHealthEditorDrawer } from "@/components/admin/group-health/group-health-editor";

function row(): GroupHealthOverviewRow {
  return {
    group_id: "g1",
    group_name: "Bayside Men",
    attendance_pct: null,
    attendance_weeks_counted: 0,
    spiritual_growth_score: 3,
    spiritual_growth_note: null,
    group_question_score: 3,
    group_question_leader_reported: false,
    computed_letter: "B",
    last_check_in_week: null,
    last_saved_at: null,
    stale: false,
    unassessed: false,
    needs_follow_up: false,
    attendance_declining: false,
  };
}

function Harness({
  onPendingChange,
}: {
  onPendingChange: (pending: boolean) => void;
}) {
  const dirtyRef = useRef(false);
  return (
    <GroupHealthEditorDrawer
      row={row()}
      period="June 2026"
      spiritualGrowthLabel="Spiritual growth"
      groupQuestionLabel="Group question"
      dirtyRef={dirtyRef}
      onRequestClose={vi.fn()}
      onSaved={vi.fn()}
      onPendingChange={onPendingChange}
      isSuperAdmin={false}
    />
  );
}

// #669 review: the group-health drawers must mirror the in-flight save state up
// to their host so its close guard can ignore dismissal while a write is
// pending — otherwise a save could resolve while the discard prompt is open.
describe("GroupHealthEditorDrawer — reports save-pending to the host", () => {
  afterEach(() => {
    cleanup();
    adminSetGroupHealthRatings.mockClear();
  });

  it("calls onPendingChange(true) while a ratings save is in flight", async () => {
    const user = userEvent.setup();
    const onPendingChange = vi.fn();
    render(<Harness onPendingChange={onPendingChange} />);

    // Starts settled.
    expect(onPendingChange).toHaveBeenLastCalledWith(false);

    await user.click(
      screen.getByRole("button", { name: "Save Bayside Men health ratings" })
    );

    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(true));
    expect(adminSetGroupHealthRatings).toHaveBeenCalledTimes(1);
  });
});
