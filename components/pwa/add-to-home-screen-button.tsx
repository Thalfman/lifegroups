"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/lg/Icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  decideInstallAffordance,
  isIosSafari,
  type BeforeInstallPromptEvent,
  type InstallAffordance,
} from "@/lib/pwa/install";
import {
  clearDeferredPrompt,
  getInstallSnapshot,
  startInstallPromptCapture,
  subscribeInstallPrompt,
} from "@/lib/pwa/install-prompt-store";

// A page-header action that helps people install the app to their Home Screen.
// On Chrome/Edge it triggers the native install prompt (captured app-wide by
// install-prompt-store, since the one-shot `beforeinstallprompt` may fire before
// this button mounts); on iOS Safari it opens a short guided modal (iOS has no
// programmatic install); everywhere the app is already installed or install is
// unsupported it renders nothing.
export function AddToHomeScreenButton() {
  // Resolved once on mount. Until then we render nothing so the server and first
  // client render agree (no hydration mismatch) and we never flash a button an
  // installed/unsupported context shouldn't see.
  const [ready, setReady] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [installed, setInstalled] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    // Idempotent — the root PwaClientSetup normally starts this already; calling
    // again guards the button working even if mounted in isolation.
    startInstallPromptCapture();
    setIosSafari(isIosSafari(navigator.userAgent, navigator.maxTouchPoints));

    const sync = () => {
      const snapshot = getInstallSnapshot();
      setDeferred(snapshot.deferred);
      setInstalled(snapshot.installed);
      if (snapshot.installed) setGuideOpen(false);
    };
    sync();
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

  const affordance: InstallAffordance = decideInstallAffordance({
    standalone: installed,
    iosSafari,
    hasDeferredPrompt: deferred !== null,
  });
  if (affordance === "hidden") return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={
          affordance === "native" ? promptNative : () => setGuideOpen(true)
        }
      >
        <Icon name="plus" />
        Add to Home Screen
      </Button>
      {affordance === "ios-guide" ? (
        <IosInstallGuide open={guideOpen} onOpenChange={setGuideOpen} />
      ) : null}
    </>
  );
}

// The iOS Safari share glyph (square with an up arrow) so the first step is
// unambiguous. Decorative — the surrounding text names it.
function ShareGlyph() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="inline-block align-text-bottom"
      style={{ stroke: "var(--c-clay)" }}
    >
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v6A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18.5 11H17" />
    </svg>
  );
}

function IosInstallGuide({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {/* Warm scrim — ink at 45%, matching the editing surface. */}
        <DialogOverlay className="fixed inset-0 z-overlay bg-ink/45" />
        <DialogContent className="fixed left-1/2 top-1/2 z-drawer w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-bg p-6 shadow-softLg data-[state=open]:animate-[lg-drawer-in_200ms_ease-out]">
          <DialogTitle className="m-0 font-display text-lg font-medium leading-snug text-ink">
            Add this app to your Home Screen
          </DialogTitle>
          <DialogDescription className="mb-0 mt-2 font-sans text-sm text-ink2">
            In Safari you can install this app so it opens full-screen, straight
            from your Home Screen.
          </DialogDescription>
          <ol className="mt-4 grid gap-3 font-sans text-base text-ink">
            <li className="flex gap-3">
              <Step n={1} />
              <span>
                Tap the Share button <ShareGlyph /> in Safari&rsquo;s toolbar.
              </span>
            </li>
            <li className="flex gap-3">
              <Step n={2} />
              <span>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <Step n={3} />
              <span>
                Tap <strong>Add</strong> — the app appears on your Home Screen.
              </span>
            </li>
          </ol>
          <div className="mt-6 flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-claySoft font-sans text-sm font-semibold text-clayDeep"
    >
      {n}
    </span>
  );
}
