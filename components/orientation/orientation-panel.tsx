"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markFirstRunOrientationSeenAction } from "@/app/(protected)/orientation-actions";

export type OrientationVariant = "leader" | "over_shepherd";

// Concept orientation for the Shepherd and Over-Shepherd surfaces (#906,
// expanding the one-sentence first-run card from #560). It explains — in the
// CONTEXT.md vocabulary, truthful to the RLS ladder — the concepts that carry
// pastoral weight: Care Notes vs Prayer Requests, author-private visibility +
// the transparency toggle (including both visibility exceptions), what
// "Needs follow-up" means, and where their group / coverage lives. A Shepherd
// should understand who can read what they write BEFORE they write it.
//
// Shown expanded on first run; "Got it" collapses it and persists the
// dismissal server-side (the existing audited RPC — optimistic, a failed
// write just re-shows it on a later load). After dismissal — on this or any
// device — a compact "View orientation" button re-opens the same panel
// locally without re-firing the action, so it stays re-openable forever.
// It never gates access: the surface is fully usable behind and after it.

const TITLE = "Welcome to your care space";

type Concept = { heading: string; body: string };

const INTRO: Record<OrientationVariant, string> = {
  leader:
    "This is where you care for the group(s) you lead. Before you write anything, here is how the pieces work — and exactly who can read what you write.",
  over_shepherd:
    "This is where you oversee the Shepherds you cover. Before you write anything, here is how the pieces work — and exactly who can read what you write.",
};

const CONCEPTS: Record<OrientationVariant, readonly Concept[]> = {
  leader: [
    {
      heading: "Care Notes & Prayer Requests",
      body:
        "Two different lists about your group. A Care Note is a pastoral " +
        "note on how the group is doing; a Prayer Request is how the team " +
        "can be praying for it, and it can carry a status over time (for " +
        "example, answered). Both live in your group's care space.",
    },
    {
      heading: "Who can read what you write",
      body:
        "Your Care Notes and Prayer Requests are private to you — no other " +
        "Shepherd or Over-Shepherd can ever read them. Ministry leadership " +
        "can read them only if an admin turns on transparency for you: " +
        "while it's on, the Ministry Admin and the Super Admin can both " +
        "read them, and turning it off seals them again. (The Ministry " +
        "Admin also keeps a private note of his own that no one — not even " +
        "the Super Admin — can read.)",
    },
    {
      heading: "“Needs follow-up”",
      body:
        "When a group's health shows “Needs follow-up”, ministry " +
        "leadership is flagging it for a check-in. It's a request for " +
        "support headed your way — not a mark against you or your group.",
    },
    {
      heading: "Where your group lives",
      body:
        "Each group you lead has a card on this dashboard; its care space " +
        "(notes and prayer) and its calendar are behind it. If a group is " +
        "missing, a Ministry Admin may not have assigned you to it yet.",
    },
  ],
  over_shepherd: [
    {
      heading: "Care Notes & Prayer Requests",
      body:
        "Two different lists about a Shepherd you cover. A Care Note " +
        "records how their shepherding is going; a Prayer Request is how " +
        "you're praying for them, and it can carry a status over time (for " +
        "example, answered).",
    },
    {
      heading: "Who can read what you write",
      body:
        "Notes you write about a Shepherd are private to you — the " +
        "Shepherd never sees them, and neither does anyone else at your " +
        "tier. Ministry leadership can read them only while that " +
        "Shepherd's transparency toggle is on: then the Ministry Admin and " +
        "the Super Admin can both read them. (The Ministry Admin also " +
        "keeps a private note of his own that no one — not even the Super " +
        "Admin — can read.)",
    },
    {
      heading: "“Needs follow-up”",
      body:
        "When a group's health shows “Needs follow-up”, it's " +
        "flagged for a check-in — attention due, not a judgment. Treat it " +
        "as the pointer to where care is needed next.",
    },
    {
      heading: "Your coverage",
      body:
        "The list below is scoped to your coverage: you see the Shepherds " +
        "assigned to you and no one beyond them. Open a Shepherd to see " +
        "how their care is going and what you've written about them.",
    },
  ],
};

export function OrientationPanel({
  variant,
  initiallySeen,
}: {
  variant: OrientationVariant;
  /** Whether this profile has already dismissed the orientation (server flag). */
  initiallySeen: boolean;
}) {
  // Open on first run; collapsed behind "View orientation" once seen.
  const [open, setOpen] = useState(!initiallySeen);
  // Once true, closing never re-fires the persistence action.
  const [everSeen, setEverSeen] = useState(initiallySeen);
  const [pending, startTransition] = useTransition();

  const handleGotIt = () => {
    // Optimistically collapse, then persist in the background. A failed write
    // leaves the flag unset, so the panel simply reopens on a later load.
    setOpen(false);
    setEverSeen(true);
    startTransition(async () => {
      await markFirstRunOrientationSeenAction();
    });
  };

  if (!open) {
    return (
      <div className="mb-4">
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
          View orientation
        </Button>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="orientation-heading"
      className="mb-4 max-w-card rounded-lg border border-sageSoft bg-sageTint p-card md:p-6"
    >
      <h2
        id="orientation-heading"
        className="m-0 mb-1.5 font-display text-lg font-medium text-ink"
      >
        {TITLE}
      </h2>
      <p className="m-0 mb-4 font-sans text-base text-ink2">{INTRO[variant]}</p>
      <div className="mb-4 grid gap-3">
        {CONCEPTS[variant].map((concept) => (
          <div key={concept.heading} className="grid gap-1">
            <h3 className="m-0 font-sans text-sm font-semibold text-ink">
              {concept.heading}
            </h3>
            <p className="m-0 font-sans text-sm leading-normal text-ink2">
              {concept.body}
            </p>
          </div>
        ))}
      </div>
      {everSeen ? (
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          onClick={handleGotIt}
          disabled={pending}
        >
          Got it
        </Button>
      )}
    </section>
  );
}
