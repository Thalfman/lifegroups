// The redirect-and-return draft store (#781 OPP-3b, plan §4 E). Most return
// flows restore a NAVIGATIONAL position (route + tab + scroll), which the
// `from=<origin>` query param already carries. Exactly one flow needs more — the
// "Manage group types" round trip from a half-filled group form, where the
// unsaved form input must survive the hop to Settings and back. This module is
// that one draft store: a thin, best-effort sessionStorage map keyed by a draft
// id passed in the URL, built on the same storage approach as
// `use-persisted-view-state` (write-through, never throws on quota / private
// mode). Deliberately scoped to one case — per §6, drafts are NOT a general
// every-form mechanism.

const PREFIX = "lg:draft:";

// A form draft is a flat map of field name → string value, exactly what a
// FormData snapshot yields. Only string entries are kept (file inputs have no
// place in the group form).
export type FormDraft = Record<string, string>;

// A fresh, collision-free id to key one draft in the URL + storage. Prefers the
// platform UUID; falls back to a time+random id where it is unavailable.
export function newDraftId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Serialize a form's current values to a draft. Reads the live DOM via FormData,
// so it captures both controlled and uncontrolled inputs as the user left them.
export function snapshotForm(form: HTMLFormElement): FormDraft {
  const out: FormDraft = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

// Persist a draft. Best-effort: a storage failure (quota, private mode, no
// window) must never break the hand-off — the user simply returns to a fresh
// form rather than crashing.
export function saveFormDraft(id: string, draft: FormDraft): void {
  try {
    window.sessionStorage.setItem(PREFIX + id, JSON.stringify(draft));
  } catch {
    // Ignore — see above.
  }
}

// Read a draft back, defensively decoded so a corrupt entry yields null rather
// than throwing. Only string-valued keys survive the decode.
export function readFormDraft(id: string): FormDraft | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + id);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const out: FormDraft = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

// Drop a draft once it has been restored (one-shot): the round trip is over, so
// a later refresh must not re-open the drawer from a stale draft.
export function clearFormDraft(id: string): void {
  try {
    window.sessionStorage.removeItem(PREFIX + id);
  } catch {
    // Ignore — see above.
  }
}
