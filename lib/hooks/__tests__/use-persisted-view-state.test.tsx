// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePersistedViewState } from "../use-persisted-view-state";
import { viewPreferenceKey } from "@/lib/admin/view-preferences";

// usePersistedViewState mirrors a surface's view selection to localStorage and
// restores it once on mount, hydration-safe and best-effort. These tests pin
// the load-bearing behaviors: restore-from-storage, default-on-empty, corrupt
// rejection, scope re-arming, and storage-unavailable resilience.

type View = { view: string };
const isView = (v: unknown): v is View =>
  typeof v === "object" && v !== null && typeof (v as View).view === "string";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("usePersistedViewState", () => {
  it("restores a previously saved, valid selection into the caller", async () => {
    const key = viewPreferenceKey("calendar", "user-1");
    window.localStorage.setItem(key, JSON.stringify({ view: "month" }));
    const restore = vi.fn();

    const { result } = renderHook(() =>
      usePersistedViewState<View>({
        surface: "calendar",
        scopeId: "user-1",
        snapshot: { view: "week" },
        restore,
        validate: isView,
      })
    );

    await waitFor(() => expect(result.current).toBe(true)); // hydrated
    expect(restore).toHaveBeenCalledWith({ view: "month" });
  });

  it("does not restore when storage is empty, and persists the current snapshot", async () => {
    const key = viewPreferenceKey("follow-ups", "user-1");
    const restore = vi.fn();

    const { result } = renderHook(() =>
      usePersistedViewState<View>({
        surface: "follow-ups",
        scopeId: "user-1",
        snapshot: { view: "open" },
        restore,
        validate: isView,
      })
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(restore).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(window.localStorage.getItem(key)).toBe(
        JSON.stringify({ view: "open" })
      )
    );
  });

  it("ignores a corrupt or schema-mismatched stored value (falls back to defaults)", async () => {
    const key = viewPreferenceKey("calendar", "user-1");
    window.localStorage.setItem(key, "{not json");
    const restore = vi.fn();

    const { result } = renderHook(() =>
      usePersistedViewState<View>({
        surface: "calendar",
        scopeId: "user-1",
        snapshot: { view: "week" },
        restore,
        validate: isView,
      })
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(restore).not.toHaveBeenCalled();
  });

  it("re-arms and restores from the new key when the scope changes", async () => {
    window.localStorage.setItem(
      viewPreferenceKey("calendar", "user-2"),
      JSON.stringify({ view: "day" })
    );
    const restore = vi.fn();

    const { result, rerender } = renderHook(
      ({ scopeId }) =>
        usePersistedViewState<View>({
          surface: "calendar",
          scopeId,
          snapshot: { view: "week" },
          restore,
          validate: isView,
        }),
      { initialProps: { scopeId: "user-1" } }
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(restore).not.toHaveBeenCalled(); // user-1 has nothing stored

    rerender({ scopeId: "user-2" });

    await waitFor(() => expect(restore).toHaveBeenCalledWith({ view: "day" }));
  });

  it("never throws when storage is unavailable (private mode / quota)", async () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(
      () => {
        throw new Error("blocked");
      }
    );
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(
      () => {
        throw new Error("quota");
      }
    );
    const restore = vi.fn();

    const { result } = renderHook(() =>
      usePersistedViewState<View>({
        surface: "calendar",
        scopeId: "user-1",
        snapshot: { view: "week" },
        restore,
        validate: isView,
      })
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(restore).not.toHaveBeenCalled();
  });
});
