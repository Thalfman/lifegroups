// Pure helpers for the "Add to Home Screen" affordance (no React, no DOM
// mutation) so the install decision can be unit-tested in isolation. The
// component in components/pwa/add-to-home-screen-button.tsx wires these to the
// browser events.

// Chrome/Edge fire this non-standard event when the app meets the install
// criteria (valid manifest + icons + a registered service worker). It is not in
// the DOM lib types, so we describe the slice we use.
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

/**
 * True for Safari on iOS/iPadOS — the only iOS context where our guided steps
 * (the Share menu → "Add to Home Screen") are accurate. iOS never fires
 * `beforeinstallprompt`, and the other iOS browsers (Chrome/Firefox/Edge/Opera)
 * surface installation through a different, in-app menu, so we exclude them.
 */
export function isIosSafari(userAgent: string): boolean {
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  if (!isIos) return false;
  const isOtherIosBrowser = /crios|fxios|edgios|opios|mercury/i.test(userAgent);
  return !isOtherIosBrowser;
}

/**
 * True when the app is already running as an installed PWA (standalone display
 * mode on Android/desktop, or the legacy `navigator.standalone` on iOS) — in
 * which case there is nothing to install and the button hides.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayModeStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(displayModeStandalone || iosStandalone);
}

export type InstallAffordance = "native" | "ios-guide" | "hidden";

/**
 * Decide which install affordance (if any) to show. Order matters: an already
 * installed app shows nothing; a captured native prompt is the one-tap path; an
 * iOS Safari visitor gets the guided modal; everything else (desktop without a
 * captured prompt, unsupported browsers) hides the button rather than offering
 * a dead control.
 */
export function decideInstallAffordance(input: {
  standalone: boolean;
  iosSafari: boolean;
  hasDeferredPrompt: boolean;
}): InstallAffordance {
  if (input.standalone) return "hidden";
  if (input.hasDeferredPrompt) return "native";
  if (input.iosSafari) return "ios-guide";
  return "hidden";
}
