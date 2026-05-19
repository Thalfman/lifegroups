"use server";

// Phase 5A.6 (corrected) preview-mode stubs for the calendar editor on
// /admin-preview and /leader-preview. The preview routes render the
// month grid against fallback data with no Supabase client, so they
// can't actually persist changes. The editor still expects a server
// action shape, so each stub returns an inline error explaining that
// preview mode does not persist anything. The UI also shows a softer
// "Preview mode" notice inside the modal.

type ActionResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
type State = ActionResult<{ id: string }> | undefined;

async function previewStub(): Promise<ActionResult<{ id: string }>> {
  return {
    ok: false,
    errors: [
      "Preview mode: changes aren't saved. Sign in and open a real group's calendar to edit.",
    ],
  };
}

export async function previewCreateCalendarEvent(
  _prev: State,
  _input: FormData,
): Promise<ActionResult<{ id: string }>> {
  return previewStub();
}

export async function previewUpdateCalendarEvent(
  _prev: State,
  _input: FormData,
): Promise<ActionResult<{ id: string }>> {
  return previewStub();
}

export async function previewArchiveCalendarEvent(
  _prev: State,
  _input: FormData,
): Promise<ActionResult<{ id: string }>> {
  return previewStub();
}
