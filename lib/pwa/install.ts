// Pure helpers for the "Add to Home Screen" affordance (no React, no DOM
// mutation) so the install decision can be unit-tested in isolation. The
// component in components/pwa/add-to-home-screen-button.tsx and the post-login
// nudge in components/pwa/install-nudge.tsx wire these to the browser events.

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

/** Which iOS browser the visitor is in — the install steps differ per browser. */
export type IosBrowser = "safari" | "chrome" | "other";

/**
 * The platform facts the install decision needs, derived once from the
 * user-agent. Kept as plain data so the decision is a pure function we can test
 * against representative UA strings.
 */
export type InstallPlatform = {
  ios: boolean;
  android: boolean;
  // Only meaningful when `ios` is true; defaults to "safari" otherwise.
  iosBrowser: IosBrowser;
};

/**
 * True for iOS/iPadOS in any browser. `maxTouchPoints` distinguishes
 * desktop-class iPadOS Safari (which reports a "Macintosh" user-agent with no
 * "iPad" token, identical to macOS Safari) from a real Mac: only the iPad
 * exposes touch points. Pass `navigator.maxTouchPoints`.
 */
function isIos(userAgent: string, maxTouchPoints: number): boolean {
  const isClassicIos = /iphone|ipad|ipod/i.test(userAgent);

  // iPadOS in its default desktop-class mode masquerades as a Mac — and it does
  // so in Safari, Chrome (CriOS), and Edge (EdgiOS) alike. The reliable tell is
  // touch points: a real Mac reports 0, only an iPad exposes them. So a
  // Macintosh UA with touch points is an iPad regardless of the browser token
  // (classifying the browser is left to detectPlatform). Keying off the browser
  // token here would wrongly hide install help for iPadOS Chrome/Edge.
  const isDesktopModeIpad = /macintosh/i.test(userAgent) && maxTouchPoints > 1;

  return isClassicIos || isDesktopModeIpad;
}

/**
 * Derive the install-relevant platform facts from a user-agent. On iOS we also
 * name the browser, because Safari, Chrome (`CriOS`), and the rest each reach
 * "Add to Home Screen" through a slightly different control, so the guided
 * steps must match.
 */
export function detectPlatform(
  userAgent: string,
  maxTouchPoints = 0
): InstallPlatform {
  const ios = isIos(userAgent, maxTouchPoints);
  const android = /android/i.test(userAgent);

  let iosBrowser: IosBrowser = "safari";
  if (ios) {
    if (/crios/i.test(userAgent)) iosBrowser = "chrome";
    else if (/fxios|edgios|opios|mercury/i.test(userAgent))
      iosBrowser = "other";
    else iosBrowser = "safari";
  }

  return { ios, android, iosBrowser };
}

/**
 * True for Safari on iOS/iPadOS specifically. Retained as a focused predicate
 * (and exported for tests); the broader `detectPlatform` is what the affordance
 * uses now.
 */
export function isIosSafari(userAgent: string, maxTouchPoints = 0): boolean {
  const platform = detectPlatform(userAgent, maxTouchPoints);
  return platform.ios && platform.iosBrowser === "safari";
}

/**
 * True when the app is already running as an installed PWA (standalone display
 * mode on Android/desktop, or the legacy `navigator.standalone` on iOS) — in
 * which case there is nothing to install and the affordance hides.
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

/** Which set of guided steps to show when no one-tap prompt is available. */
export type InstallGuideKind =
  | "ios-safari"
  | "ios-chrome"
  | "ios-other"
  | "android";

/**
 * What the install control should do:
 *  - `native`  — a captured `beforeinstallprompt` is ready; one tap installs.
 *  - `guide`   — no programmatic install here; walk the user through the right
 *                manual steps for their browser (the `guide` names which).
 *  - `hidden`  — nothing to offer (already installed, or a desktop browser with
 *                no captured prompt, where the mobile "Home Screen" steps would
 *                be wrong and the OS install icon already exists).
 */
export type InstallAffordance =
  | { kind: "native" }
  | { kind: "guide"; guide: InstallGuideKind }
  | { kind: "hidden" };

/**
 * Decide which install affordance to show. Order matters: an already installed
 * app shows nothing; a captured native prompt is the one-tap path; otherwise we
 * never leave a mobile user at a dead end — every iOS browser and Android get
 * guided steps tailored to them. Only a desktop browser without a captured
 * prompt hides, since the guided "Add to Home Screen" steps are mobile-shaped
 * and desktop Chromium surfaces its own address-bar install affordance.
 */
export function decideInstallAffordance(input: {
  standalone: boolean;
  hasDeferredPrompt: boolean;
  platform: InstallPlatform;
}): InstallAffordance {
  if (input.standalone) return { kind: "hidden" };
  if (input.hasDeferredPrompt) return { kind: "native" };

  if (input.platform.ios) {
    if (input.platform.iosBrowser === "chrome")
      return { kind: "guide", guide: "ios-chrome" };
    if (input.platform.iosBrowser === "other")
      return { kind: "guide", guide: "ios-other" };
    return { kind: "guide", guide: "ios-safari" };
  }

  if (input.platform.android) return { kind: "guide", guide: "android" };

  return { kind: "hidden" };
}

/**
 * Whether the gentle post-login nudge banner should appear. It rides on the
 * same affordance, but is intentionally narrower: only on mobile (desktop users
 * get the quiet Settings card, never a banner), only when there is something to
 * offer, and only until the user dismisses it.
 */
export function shouldShowInstallNudge(input: {
  affordance: InstallAffordance;
  platform: InstallPlatform;
  dismissed: boolean;
}): boolean {
  if (input.dismissed) return false;
  if (input.affordance.kind === "hidden") return false;
  return input.platform.ios || input.platform.android;
}
