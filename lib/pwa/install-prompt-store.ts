import { isStandalone, type BeforeInstallPromptEvent } from "./install";

// App-wide capture of the install lifecycle. Chrome/Edge fire
// `beforeinstallprompt` once, on whichever page first meets the install
// criteria — often /login, before any home-page button is mounted — and the
// event does not re-fire on a soft (client-side) navigation into /admin,
// /leader, or /over-shepherd. Capturing here (started from the root-mounted
// PwaClientSetup) stashes that one-shot event so the button can use it whenever
// it later mounts, instead of adding its listener too late and missing it.

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let started = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Begin capturing `beforeinstallprompt` / `appinstalled` once, as early as the
 * app mounts on the client. Idempotent — safe to call from multiple components.
 */
export function startInstallPromptCapture(): void {
  if (typeof window === "undefined" || started) return;
  started = true;
  installed = isStandalone();
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress Chrome's mini-infobar; the in-app button drives the prompt.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export function getInstallSnapshot(): {
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
} {
  return { deferred, installed };
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A deferred prompt can only be used once; drop it after prompting. */
export function clearDeferredPrompt(): void {
  if (deferred === null) return;
  deferred = null;
  notify();
}
