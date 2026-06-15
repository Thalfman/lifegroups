"use client";

import { useEffect, useRef, useState } from "react";
import {
  parseStoredPreference,
  serializePreference,
  viewPreferenceKey,
} from "@/lib/admin/view-preferences";
import { useValueChange } from "@/lib/hooks/use-value-change";

/**
 * Remember an admin surface's filter / view selection across reloads and
 * return visits (Admin Interaction Model PRD req 12 / P2, #263). The caller
 * keeps owning its state with ordinary `useState`; this hook just mirrors a
 * `snapshot` of that state to localStorage and, once on mount, restores the
 * last saved snapshot back into the caller via `restore`.
 *
 * Hydration-safe by design: the surface renders its render-time defaults
 * through SSR and the first client render (so server and client markup match),
 * and only adopts the persisted selection after the restore effect runs. The
 * returned `hydrated` flag lets callers hold any persistence-dependent
 * one-shot logic (e.g. a responsive default) until restore has had its say.
 *
 * Persistence is best-effort: storage that is unavailable (private mode),
 * full, or holding a stale/corrupt value never throws — the surface simply
 * falls back to its defaults.
 */
export function usePersistedViewState<T>(options: {
  /** Stable identifier for the surface, e.g. "calendar" or "follow-ups". */
  surface: string;
  /** Per-user scope (profile id); null/undefined uses a shared bucket. */
  scopeId: string | null | undefined;
  /** Current selection to persist. Recreated each render — that is fine. */
  snapshot: T;
  /** Apply a restored selection back into the caller's state. */
  restore: (saved: T) => void;
  /** Type guard rejecting corrupt or stale stored shapes. */
  validate: (value: unknown) => value is T;
}): boolean {
  const { surface, scopeId, snapshot, restore, validate } = options;
  const key = viewPreferenceKey(surface, scopeId);

  // Hold the latest callbacks in refs so the restore effect can key off the
  // storage key alone and fire exactly once per key, without re-running every
  // time the parent re-creates these closures. The refs are written in an effect
  // (not during render) so react-hooks/refs stays satisfied; the only reader is
  // the restore effect below, which runs after this one on every render.
  const restoreRef = useRef(restore);
  const validateRef = useRef(validate);
  useEffect(() => {
    restoreRef.current = restore;
    validateRef.current = validate;
  });

  const [hydrated, setHydrated] = useState(false);
  // The last value we wrote (or read), so the persist effect can skip
  // redundant writes when the snapshot object is new-by-identity but equal.
  const lastWritten = useRef<string | null>(null);

  // Re-arm hydration when the storage key (a scope change) changes, derived
  // during render so the restore effect can do its external read without a
  // synchronous setState in the effect body.
  useValueChange(key, () => setHydrated(false));

  // Restore once per storage key (a scope change re-runs it).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      // Storage blocked/unavailable: defaults stand.
    }
    const saved = parseStoredPreference(raw, validateRef.current);
    if (saved !== null) {
      lastWritten.current = raw;
      restoreRef.current(saved);
    }
    // Marking hydration complete after the client-only localStorage read is an
    // external-system sync, not the derivable cascading-render the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [key]);

  // Persist on change, but only after the restore pass — otherwise the
  // render-time defaults would overwrite the saved selection before it is read
  // back on mount.
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const serialized = serializePreference(snapshot);
    if (serialized === lastWritten.current) return;
    try {
      window.localStorage.setItem(key, serialized);
      lastWritten.current = serialized;
    } catch {
      // Quota / private mode: persistence is best-effort, non-fatal.
    }
  }, [key, hydrated, snapshot]);

  return hydrated;
}
