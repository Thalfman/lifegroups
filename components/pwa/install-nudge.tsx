"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/lg/Icon";
import { InstallGuideModal } from "@/components/pwa/install-guide-modal";
import {
  decideInstallAffordance,
  detectPlatform,
  shouldShowInstallNudge,
  type BeforeInstallPromptEvent,
  type InstallGuideKind,
  type InstallPlatform,
} from "@/lib/pwa/install";
import {
  clearDeferredPrompt,
  getInstallSnapshot,
  startInstallPromptCapture,
  subscribeInstallPrompt,
} from "@/lib/pwa/install-prompt-store";

// A gentle, dismissible "add this to your Home Screen" strip shown once across
// the protected app on mobile, so a non-technical user doesn't have to discover
// the Settings card. It offers the one-tap native install when the browser
// supports it, otherwise opens the guided steps for their browser. It hides
// itself when the app is already installed, on desktop, or once dismissed —
// the permanent home for installing stays the Settings → System card.

const DISMISS_KEY = "lg.install-nudge.dismissed";

const SSR_PLATFORM: InstallPlatform = {
  ios: false,
  android: false,
  iosBrowser: "safari",
};

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    // Storage blocked (private mode, etc.) — treat as not dismissed; the
    // in-memory state still hides it for the rest of this session.
    return false;
  }
}

function persistDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Best-effort: if storage is unavailable the banner still hides for this
    // session via component state; it may reappear next session.
  }
}

export function InstallNudge() {
  const [ready, setReady] = useState(false);
  const [platform] = useState<InstallPlatform>(() =>
    typeof navigator === "undefined"
      ? SSR_PLATFORM
      : detectPlatform(navigator.userAgent, navigator.maxTouchPoints)
  );
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  // Read once at init (SSR-safe: readDismissed swallows the no-localStorage
  // case). Everything stays gated behind `ready` until the mount effect, so a
  // server/client difference here never reaches the DOM.
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    startInstallPromptCapture();
    const sync = () => {
      const snapshot = getInstallSnapshot();
      setDeferred(snapshot.deferred);
      setInstalled(snapshot.installed);
    };
    sync();
    // Reveal only after the first client-side sync so server and first-client
    // render agree (no hydration mismatch). Mount flag, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    return subscribeInstallPrompt(sync);
  }, []);

  const dismiss = useCallback(() => {
    persistDismissed();
    setDismissed(true);
  }, []);

  const promptNative = useCallback(async () => {
    const { deferred: prompt } = getInstallSnapshot();
    if (!prompt) return;
    await prompt.prompt();
    try {
      await prompt.userChoice;
    } finally {
      clearDeferredPrompt();
    }
    // Whether they accepted or declined the native prompt, stop nudging — an
    // accept also installs (appinstalled hides it anyway), and a decline
    // shouldn't flip us into the manual-steps banner.
    persistDismissed();
    setDismissed(true);
  }, []);

  if (!ready) return null;

  const affordance = decideInstallAffordance({
    standalone: installed,
    hasDeferredPrompt: deferred !== null,
    platform,
  });

  if (!shouldShowInstallNudge({ affordance, platform, dismissed })) return null;

  // shouldShowInstallNudge guarantees the affordance is native or guide here.
  const guide: InstallGuideKind | null =
    affordance.kind === "guide" ? affordance.guide : null;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
        <span className="hidden shrink-0 sm:inline" aria-hidden>
          <Icon name="sparkle" color="var(--c-clay)" size={18} />
        </span>
        <p className="m-0 flex-1 font-sans text-sm text-ink2">
          Add LifeGroups to your Home Screen so it opens like a full-screen app.
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={guide ? () => setGuideOpen(true) : promptNative}
        >
          Add
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Not now"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-ink3 transition hover:bg-surfaceAlt hover:text-ink"
        >
          <Icon name="x" />
        </button>
      </div>
      {guide ? (
        <InstallGuideModal
          guide={guide}
          open={guideOpen}
          onOpenChange={setGuideOpen}
        />
      ) : null}
    </>
  );
}
