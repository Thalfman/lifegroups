"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InstallGuideKind } from "@/lib/pwa/install";

// A short, friendly modal that walks a non-technical user through installing the
// app on their device, with steps tailored to their browser. Used both by the
// Settings "Add to Home Screen" button and by the post-login install nudge.
// There is no programmatic install on iOS at all (and not always one on
// Android), so guided steps — not a dead end — are the seamless fallback.

// The iOS share glyph (square with an up arrow) so the share step is
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

type GuideContent = {
  intro: string;
  steps: ReactNode[];
  // An optional closing tip — e.g. pointing iOS users to Safari for the
  // simplest path when their browser hides the option.
  tip?: string;
};

function guideContent(guide: InstallGuideKind): GuideContent {
  switch (guide) {
    case "ios-safari":
      return {
        intro:
          "In Safari you can install this app so it opens full-screen, straight from your Home Screen.",
        steps: [
          <>
            Tap the Share button <ShareGlyph /> at the bottom of Safari.
          </>,
          <>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </>,
          <>
            Tap <strong>Add</strong> — the app appears on your Home Screen.
          </>,
        ],
      };
    case "ios-chrome":
      return {
        intro:
          "In Chrome you can add this app to your Home Screen so it opens full-screen.",
        steps: [
          <>
            Tap the Share button <ShareGlyph /> in Chrome&rsquo;s toolbar.
          </>,
          <>
            Tap <strong>Add to Home Screen</strong>.
          </>,
          <>
            Tap <strong>Add</strong> — the app appears on your Home Screen.
          </>,
        ],
      };
    case "ios-other":
      return {
        intro:
          "You can add this app to your Home Screen so it opens full-screen.",
        steps: [
          <>Open your browser&rsquo;s menu.</>,
          <>
            Tap <strong>Add to Home Screen</strong>.
          </>,
          <>Confirm — the app appears on your Home Screen.</>,
        ],
        tip: "Don't see that option? Open this page in Safari for the simplest setup.",
      };
    case "android":
      return {
        intro:
          "You can install this app so it opens full-screen, straight from your Home screen.",
        steps: [
          <>
            Tap the menu (<strong>⋮</strong>) in the top-right.
          </>,
          <>
            Tap <strong>Install app</strong> (or{" "}
            <strong>Add to Home screen</strong>).
          </>,
          <>Confirm — the app appears on your Home screen.</>,
        ],
      };
  }
}

export function InstallGuideModal({
  guide,
  open,
  onOpenChange,
}: {
  guide: InstallGuideKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const content = guideContent(guide);
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
            {content.intro}
          </DialogDescription>
          <ol className="mt-4 grid gap-3 font-sans text-base text-ink">
            {content.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <Step n={index + 1} />
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {content.tip ? (
            <p className="m-0 mt-4 font-sans text-sm italic text-ink3">
              {content.tip}
            </p>
          ) : null}
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
