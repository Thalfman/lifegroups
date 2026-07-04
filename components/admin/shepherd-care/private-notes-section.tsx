"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  adminAddPrivateNoteKeySlot,
  adminEnrollPrivateNoteKeys,
  adminRemovePrivateNoteKeySlot,
  adminRotatePrivateNoteRecovery,
  adminUpsertShepherdCarePrivateNote,
} from "@/app/(protected)/admin/shepherd-care/actions";
import {
  errorTextClassName,
  fieldInputClassName as FIELD_INPUT,
  fieldLabelClassName as FIELD_LABEL,
  formNoteClassName,
  successTextClassName,
} from "@/components/admin/forms/field-styles";
import {
  createPrivateNotesSession,
  passkeySlotsOf,
} from "@/lib/admin/private-notes-session";
import { isPrfPasskeySupported } from "@/lib/crypto/private-notes";
import { Button } from "@/components/ui/button";
import type {
  PrivateNoteCiphertext,
  PrivateNoteKeySlot,
} from "@/lib/supabase/shepherd-care-private-note-reads";

type Props = {
  careProfileId: string;
  creatorProfileId: string;
  shepherdProfileId: string;
  initialNote: PrivateNoteCiphertext | null;
  initialSlots: PrivateNoteKeySlot[];
};

// Form anatomy comes from the canonical field styles (design direction §4);
// only the spacing under ledes/status lines is local to this stacked layout.
// Status lines use the canonical voices (error in rose, success in sage).
const FORM_NOTE = `${formNoteClassName} mb-3`;
const ERROR_TEXT = `${errorTextClassName} mb-3`;
const SUCCESS_TEXT = `${successTextClassName} mb-3`;

const CODE =
  "select-all break-all rounded-sm border border-line bg-bg px-3.5 py-3 font-mono text-md tracking-wider text-ink";

export function PrivateNotesSection({
  careProfileId,
  creatorProfileId,
  shepherdProfileId,
  initialNote,
  initialSlots,
}: Props) {
  // The unlock-session state machine — DEK lifecycle (unlock, idle wipe,
  // lock), key-slot transitions, and one-time recovery-code presentation —
  // lives in lib/admin/private-notes-session (#490). This shell only renders
  // its state and forwards events; the server actions are injected as ports.
  const [session] = useState(() =>
    createPrivateNotesSession({
      careProfileId,
      creatorProfileId,
      shepherdProfileId,
      initialNote,
      initialSlots,
      getRpId: () => window.location.hostname,
      actions: {
        enrollKeys: (input) => adminEnrollPrivateNoteKeys(undefined, input),
        upsertNote: (input) =>
          adminUpsertShepherdCarePrivateNote(undefined, input),
        addKeySlot: (input) => adminAddPrivateNoteKeySlot(undefined, input),
        rotateRecovery: (input) =>
          adminRotatePrivateNoteRecovery(undefined, input),
        removeKeySlot: (input) =>
          adminRemovePrivateNoteKeySlot(undefined, input),
      },
    })
  );
  const state = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  );

  // Stop the idle timer when the section unmounts.
  useEffect(() => () => session.destroy(), [session]);

  // The machine wipes the in-memory DEK after IDLE_WIPE_MS of inactivity
  // (spec §7/§11) and owns the timer; this effect only forwards page activity
  // (which resets the timer) and pagehide (wipe on tab/page close — pagehide
  // also fires on SPA navigation away) while unlocked. With the DEK gone the
  // section falls back to the locked/unlock view, forcing a re-unlock.
  useEffect(() => {
    if (!state.unlocked) return;
    const activity = () => session.recordActivity();
    const wipe = () => session.wipe();
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "focus",
    ];
    session.recordActivity();
    events.forEach((e) => window.addEventListener(e, activity));
    window.addEventListener("pagehide", wipe);
    return () => {
      events.forEach((e) => window.removeEventListener(e, activity));
      window.removeEventListener("pagehide", wipe);
    };
  }, [session, state.unlocked]);

  const passkeySlots = passkeySlotsOf(state.slots);

  return (
    <section
      className="rounded-lg border border-line bg-surface p-card"
      aria-label="Private notes (only you)"
    >
      <h2 className="m-0 mb-1.5 font-display text-lg font-medium text-ink">
        Private notes (only you)
      </h2>
      <p className={FORM_NOTE}>
        Encrypted on your device before it&apos;s saved. No one else, not other
        admins, and not the platform owner, can read it from the database or
        backups. If you lose every unlock method, the note can never be
        recovered.
      </p>

      {state.error ? <p className={ERROR_TEXT}>{state.error}</p> : null}
      {state.status ? <p className={SUCCESS_TEXT}>{state.status}</p> : null}

      {/* Recovery-code rotation: show the NEW code once, require capture, then
          persist (revoking the old code). */}
      {state.rotationCode ? (
        <div className="grid gap-3">
          <p className="m-0 font-sans text-sm leading-normal text-ink">
            Save this <strong>new</strong> recovery code now. It replaces your
            old one. The old code stops working the moment you confirm. Shown
            once.
          </p>
          <div className={CODE}>{state.rotationCode}</div>
          <label className="flex items-start gap-2 font-sans">
            <input
              type="checkbox"
              checked={state.rotationAck}
              onChange={(e) => session.setRotationAck(e.target.checked)}
              className="mt-[3px]"
            />
            <span className="text-sm text-ink2">
              I&apos;ve saved my new recovery code. I understand losing all
              unlock methods means these notes can never be recovered.
            </span>
          </label>
          <div>
            <Button
              variant="solid"
              onClick={session.confirmRotateRecovery}
              disabled={!state.rotationAck || state.busy}
            >
              {state.busy ? "Rotating…" : "Confirm new recovery code"}
            </Button>
          </div>
        </div>
      ) : /* Enrollment: show the recovery code once, require capture. */
      state.recoveryCode ? (
        <div className="grid gap-3">
          <p className="m-0 font-sans text-sm leading-normal text-ink">
            Save this recovery code now. It is shown once and is the only way
            back in if you lose your passkey.
          </p>
          <div className={CODE}>{state.recoveryCode}</div>
          <label className="flex items-start gap-2 font-sans">
            <input
              type="checkbox"
              checked={state.recoveryAck}
              onChange={(e) => session.setRecoveryAck(e.target.checked)}
              className="mt-[3px]"
            />
            <span className="text-sm text-ink2">
              I&apos;ve saved my recovery code. I understand a lost code means
              these notes can never be recovered.
            </span>
          </label>
          <div>
            <Button
              variant="solid"
              onClick={session.confirmEnrollment}
              disabled={!state.recoveryAck || state.busy}
            >
              {state.busy ? "Finishing…" : "Finish setup"}
            </Button>
          </div>
        </div>
      ) : !state.enrolled ? (
        <div>
          <Button
            variant="solid"
            onClick={session.enroll}
            disabled={state.busy}
          >
            {state.busy ? "Setting up…" : "Set up private notes"}
          </Button>
        </div>
      ) : !state.unlocked ? (
        <div className="grid max-w-[420px] gap-3">
          {passkeySlots.length > 0 ? (
            <div>
              <Button
                variant="solid"
                onClick={session.unlockWithPasskey}
                disabled={state.busy}
              >
                Unlock with passkey
              </Button>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <label htmlFor="sc4-recovery" className={FIELD_LABEL}>
              Recovery code
            </label>
            <input
              id="sc4-recovery"
              type="text"
              autoComplete="off"
              value={state.recoveryInput}
              onChange={(e) => session.setRecoveryInput(e.target.value)}
              className={FIELD_INPUT}
              placeholder="XXXXX-XXXXX-…"
            />
            <div>
              <Button
                variant="ghost"
                onClick={session.unlockWithRecovery}
                disabled={state.busy || state.recoveryInput.trim().length === 0}
              >
                Unlock with recovery code
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <textarea
            value={state.noteText}
            onChange={(e) => session.setNoteText(e.target.value)}
            rows={6}
            className={`${FIELD_INPUT} min-h-[120px] resize-y`}
            placeholder="A note only you can read…"
          />
          <div className="flex gap-2.5">
            <Button
              variant="solid"
              onClick={session.save}
              disabled={state.busy}
            >
              {state.busy ? "Saving…" : "Save private note"}
            </Button>
            <Button
              variant="ghost"
              onClick={session.lock}
              disabled={state.busy}
            >
              Lock
            </Button>
          </div>

          {/* Manage unlock methods (#113). */}
          <div className="mt-1 grid gap-2.5 border-t border-line pt-3.5">
            <h3 className="m-0 font-sans text-sm font-semibold text-ink">
              Unlock methods
            </h3>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {state.slots.map((slot) => (
                <li
                  key={slot.id}
                  className="flex items-center justify-between gap-2.5 font-sans text-sm text-ink"
                >
                  <span>
                    {slot.slot_type === "recovery"
                      ? "Recovery code"
                      : slot.label || "Passkey"}
                    <span className="text-ink3">
                      {slot.slot_type === "recovery" ? " (backstop)" : ""}
                    </span>
                  </span>
                  {slot.slot_type === "passkey" ? (
                    slot.id.startsWith("pending-") ? (
                      <span className="text-xs text-ink3">
                        Reload to manage
                      </span>
                    ) : state.confirmRemoveId === slot.id ? (
                      <span className="flex gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            session.setConfirmRemoveId(null);
                            session.removeSlot(slot.id);
                          }}
                          disabled={state.busy}
                        >
                          Confirm remove
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => session.setConfirmRemoveId(null)}
                          disabled={state.busy}
                        >
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => session.setConfirmRemoveId(slot.id)}
                        disabled={state.busy}
                      >
                        Remove
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
            {state.confirmRemoveId ? (
              <p className="m-0 font-sans text-sm text-rose">
                Removing a passkey leaves fewer ways in. Make sure you still
                have your recovery code or another passkey before confirming.
                There is no server-side reset.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2.5">
              {isPrfPasskeySupported() ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={session.addPasskey}
                  disabled={state.busy}
                >
                  Add a passkey
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={session.startRotateRecovery}
                disabled={state.busy}
              >
                Rotate recovery code
              </Button>
            </div>
            <p className="m-0 font-sans text-xs leading-normal text-ink2">
              Lose every unlock method and these notes can never be recovered.
              There is no server-side reset.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
