"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/lg/Icon";
import { InstallGuideModal } from "@/components/pwa/install-guide-modal";
import {
  decideInstallAffordance,
  detectPlatform,
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

const SSR_PLATFORM: InstallPlatform = {
  ios: false,
  android: false,
  iosBrowser: "safari",
};

// A page-header / Settings action that helps people install the app to their
// Home Screen. On Chrome/Edge it triggers the native install prompt (captured
// app-wide by install-prompt-store, since the one-shot `beforeinstallprompt`
// may fire before this button mounts); everywhere else it opens a short guided
// modal with the right steps for the user's browser (iOS Safari/Chrome, other
// iOS, Android). It only renders nothing when the app is already installed, or
// on a desktop browser with no captured prompt.
export function AddToHomeScreenButton() {
  // Resolved once on mount. Until then we render nothing so the server and first
  // client render agree (no hydration mismatch) and we never flash a button an
  // installed context shouldn't see.
  const [ready, setReady] = useState(false);
  // UA-derived and stable for the component's life, so it is read once via a
  // lazy initializer rather than set in the effect. SSR-guarded: the server
  // renders nothing until `ready` flips on the client, so the server/client
  // difference never reaches the DOM.
  const [platform] = useState<InstallPlatform>(() =>
    typeof navigator === "undefined"
      ? SSR_PLATFORM
      : detectPlatform(navigator.userAgent, navigator.maxTouchPoints)
  );
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  // The guide chosen when the modal was opened, held independently of the live
  // affordance so an incoming beforeinstallprompt (which flips the affordance to
  // native) can't unmount the open modal mid-read.
  const [activeGuide, setActiveGuide] = useState<InstallGuideKind | null>(null);

  useEffect(() => {
    // Idempotent — the root PwaClientSetup normally starts this already; calling
    // again guards the button working even if mounted in isolation.
    startInstallPromptCapture();

    const sync = () => {
      const snapshot = getInstallSnapshot();
      setDeferred(snapshot.deferred);
      setInstalled(snapshot.installed);
      if (snapshot.installed) {
        setGuideOpen(false);
        setActiveGuide(null);
      }
    };
    sync();
    // Reveal only after mounting + the initial sync from the client-only
    // install-prompt store, so server and first-client render agree. This is a
    // mount flag, not the derivable cascading-render the rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    return subscribeInstallPrompt(sync);
  }, []);

  const promptNative = useCallback(async () => {
    const { deferred: prompt } = getInstallSnapshot();
    if (!prompt) return;
    await prompt.prompt();
    try {
      await prompt.userChoice;
    } finally {
      // A deferred prompt can only be used once; drop it either way.
      clearDeferredPrompt();
    }
  }, []);

  if (!ready) return null;

  const affordance = decideInstallAffordance({
    standalone: installed,
    hasDeferredPrompt: deferred !== null,
    platform,
  });
  if (affordance.kind === "hidden") return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={
          affordance.kind === "native"
            ? promptNative
            : () => {
                setActiveGuide(affordance.guide);
                setGuideOpen(true);
              }
        }
      >
        <Icon name="plus" />
        Add to Home Screen
      </Button>
      {activeGuide ? (
        <InstallGuideModal
          guide={activeGuide}
          open={guideOpen}
          onOpenChange={(open) => {
            setGuideOpen(open);
            if (!open) setActiveGuide(null);
          }}
        />
      ) : null}
    </>
  );
}
