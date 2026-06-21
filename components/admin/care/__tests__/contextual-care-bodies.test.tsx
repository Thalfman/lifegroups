// @vitest-environment jsdom
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContextualBodyControls } from "@/components/lg/admin/contextual-action-provider";

// Stub the form bodies + the resolver action so this test exercises the wiring
// (which body, with which props) without pulling the server-action chains.
const resolveCareProfileId = vi.fn();
vi.mock("@/app/(protected)/admin/shepherd-care/care-profile-resolve", () => ({
  resolveCareProfileId: (id: string) => resolveCareProfileId(id),
}));

let lastFollowUpProps: Record<string, unknown> = {};
vi.mock("@/components/admin/shepherd-care/care-follow-up-create-form", () => ({
  CareFollowUpCreateForm: (props: Record<string, unknown>) => {
    lastFollowUpProps = props;
    return (
      <div
        data-testid="followup-form"
        data-care-profile-id={props.careProfileId as string}
        data-shepherd-id={props.shepherdProfileId as string}
      />
    );
  },
}));

let lastNoteProps: Record<string, unknown> = {};
vi.mock("@/components/admin/shepherd-care/care-note-write-form", () => ({
  CareNoteWriteForm: (props: Record<string, unknown>) => {
    lastNoteProps = props;
    return <div data-testid="note-form" />;
  },
}));

vi.mock("@/components/admin/shepherd-care/care-action-forms", () => ({
  LogTouchForm: (props: Record<string, unknown>) => (
    <div
      data-testid="log-form"
      data-type={props.interactionType as string}
      data-shepherd-id={props.shepherdProfileId as string}
    />
  ),
  CareProfileFieldForm: (props: Record<string, unknown>) => (
    <div data-testid="profile-form" data-field={props.field as string} />
  ),
}));

import { CARE_CONTEXTUAL_BODIES } from "@/components/admin/care/contextual-care-bodies";
import { CONTEXTUAL_ACTION_REGISTRY } from "@/lib/admin/contextual-actions";

function controls(): ContextualBodyControls {
  return {
    markDirty: vi.fn(),
    reportPending: vi.fn(),
    markSaved: vi.fn(),
    requestClose: vi.fn(),
  };
}

const LEADER = { kind: "leader" as const, id: "ldr-1", label: "Sam Carter" };

function actionById(id: string) {
  const action = CONTEXTUAL_ACTION_REGISTRY.leader.find((a) => a.id === id);
  if (!action) throw new Error(`no action ${id}`);
  return action;
}

afterEach(() => {
  cleanup();
  resolveCareProfileId.mockReset();
  lastFollowUpProps = {};
  lastNoteProps = {};
});

// #776 Phase 1 (OPP-1) — the Care drawer bodies, with special attention to the
// follow-up resolver, which must never post the leader profile id as the
// care_profile_id.
describe("CARE_CONTEXTUAL_BODIES — follow-up resolver", () => {
  function renderFollowUp(c = controls()) {
    const body = CARE_CONTEXTUAL_BODIES.care_create_follow_up!;
    return render(
      <>
        {body({
          entity: LEADER,
          action: actionById("create_follow_up"),
          controls: c,
        })}
      </>
    );
  }

  it("resolves the care profile id and posts THAT, not the leader id", async () => {
    resolveCareProfileId.mockResolvedValue({ ok: true, id: "care-99" });
    renderFollowUp();

    const form = await screen.findByTestId("followup-form");
    expect(resolveCareProfileId).toHaveBeenCalledWith("ldr-1");
    // The resolved care_profile_id is used — never the subject profile id.
    expect(form.getAttribute("data-care-profile-id")).toBe("care-99");
    expect(form.getAttribute("data-care-profile-id")).not.toBe("ldr-1");
    expect(form.getAttribute("data-shepherd-id")).toBe("ldr-1");
  });

  it("forwards the drawer controls to the follow-up form", async () => {
    const c = controls();
    resolveCareProfileId.mockResolvedValue({ ok: true, id: "care-99" });
    renderFollowUp(c);
    await screen.findByTestId("followup-form");
    expect(lastFollowUpProps.onSaved).toBe(c.markSaved);
    expect(lastFollowUpProps.onCancel).toBe(c.requestClose);
  });

  it("explains (no surprise write) when the leader has no care profile yet", async () => {
    resolveCareProfileId.mockResolvedValue({ ok: true, id: null });
    renderFollowUp();
    await waitFor(() =>
      expect(
        screen.getByText(/Log an interaction or set the care profile/)
      ).toBeTruthy()
    );
    expect(screen.queryByTestId("followup-form")).toBeNull();
  });

  it("surfaces a resolver error", async () => {
    resolveCareProfileId.mockResolvedValue({ ok: false, error: "boom" });
    renderFollowUp();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("boom")
    );
  });
});

describe("CARE_CONTEXTUAL_BODIES — note + log bodies", () => {
  it("wires the care-note body to the leader entity + controls", () => {
    const c = controls();
    const body = CARE_CONTEXTUAL_BODIES.care_note_writer!;
    render(
      <>
        {body({
          entity: LEADER,
          action: actionById("add_care_note"),
          controls: c,
        })}
      </>
    );
    expect(lastNoteProps.subjectProfileId).toBe("ldr-1");
    expect(lastNoteProps.subjectName).toBe("Sam Carter");
    expect(lastNoteProps.kind).toBe("care_note");
    expect(lastNoteProps.onSaved).toBe(c.markSaved);
  });

  it("maps the log action id to the interaction type", () => {
    const body = CARE_CONTEXTUAL_BODIES.care_log_touch!;
    render(
      <>
        {body({
          entity: LEADER,
          action: actionById("log_text"),
          controls: controls(),
        })}
      </>
    );
    expect(screen.getByTestId("log-form").getAttribute("data-type")).toBe(
      "text"
    );
  });
});
