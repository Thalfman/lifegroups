"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import {
  adminAddPrivateNoteKeySlot,
  adminEnrollPrivateNoteKeys,
  adminRemovePrivateNoteKeySlot,
  adminRotatePrivateNoteRecovery,
  adminUpsertShepherdCarePrivateNote,
} from "@/app/(protected)/admin/shepherd-care/actions";
import { PButton } from "@/components/pastoral/button";
import {
  errorTextStyle,
  fieldInputStyle,
  fieldLabelStyle,
  formNoteStyle,
  successTextStyle,
} from "@/components/admin/forms/field-styles";
import {
  createPrivateNotesSession,
  passkeySlotsOf,
} from "@/lib/admin/private-notes-session";
import { isPrfPasskeySupported } from "@/lib/crypto/private-notes";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type {
  PrivateNoteCiphertext,
  PrivateNoteKeySlot,
} from "@/lib/supabase/read-models";

type Props = {
  careProfileId: string;
  creatorProfileId: string;
  shepherdProfileId: string;
  initialNote: PrivateNoteCiphertext | null;
  initialSlots: PrivateNoteKeySlot[];
};

const sectionTitleStyle = {
  fontFamily: fontSans,
  fontSize: 14,
  letterSpacing: 0.6,
  margin: "0 0 6px",
  color: P.ink,
} as const;

const codeStyle = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 16,
  letterSpacing: 1,
  color: P.ink,
  background: P.bg,
  border: `1px solid ${P.line}`,
  borderRadius: 8,
  padding: "12px 14px",
  wordBreak: "break-all" as const,
  userSelect: "all" as const,
};

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
    <section style={cardStyle} aria-label="Private notes (only you)">
      <h2 style={sectionTitleStyle}>Private notes (only you)</h2>
      <p style={formNoteStyle}>
        Encrypted on your device before it&apos;s saved. No one else — not other
        admins, and not the platform owner — can read it from the database or
        backups. If you lose every unlock method, the note can never be
        recovered.
      </p>

      {state.error ? (
        <p style={{ ...errorTextStyle, marginBottom: 12 }}>{state.error}</p>
      ) : null}
      {state.status ? (
        <p style={{ ...successTextStyle, marginBottom: 12 }}>{state.status}</p>
      ) : null}

      {/* Recovery-code rotation: show the NEW code once, require capture, then
          persist (revoking the old code). */}
      {state.rotationCode ? (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ ...formNoteStyle, margin: 0, color: P.ink }}>
            Save this <strong>new</strong> recovery code now. It replaces your
            old one — the old code stops working the moment you confirm. Shown
            once.
          </p>
          <div style={codeStyle}>{state.rotationCode}</div>
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontFamily: fontBody,
            }}
          >
            <input
              type="checkbox"
              checked={state.rotationAck}
              onChange={(e) => session.setRotationAck(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13, color: P.ink2 }}>
              I&apos;ve saved my new recovery code — I understand losing all
              unlock methods means these notes can never be recovered.
            </span>
          </label>
          <div>
            <PButton
              tone="solid"
              onClick={session.confirmRotateRecovery}
              disabled={!state.rotationAck || state.busy}
            >
              {state.busy ? "Rotating…" : "Confirm new recovery code"}
            </PButton>
          </div>
        </div>
      ) : /* Enrollment: show the recovery code once, require capture. */
      state.recoveryCode ? (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ ...formNoteStyle, margin: 0, color: P.ink }}>
            Save this recovery code now. It is shown once and is the only way
            back in if you lose your passkey.
          </p>
          <div style={codeStyle}>{state.recoveryCode}</div>
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontFamily: fontBody,
            }}
          >
            <input
              type="checkbox"
              checked={state.recoveryAck}
              onChange={(e) => session.setRecoveryAck(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13, color: P.ink2 }}>
              I&apos;ve saved my recovery code — I understand a lost code means
              these notes can never be recovered.
            </span>
          </label>
          <div>
            <PButton
              tone="solid"
              onClick={session.confirmEnrollment}
              disabled={!state.recoveryAck || state.busy}
            >
              {state.busy ? "Finishing…" : "Finish setup"}
            </PButton>
          </div>
        </div>
      ) : !state.enrolled ? (
        <div>
          <PButton tone="solid" onClick={session.enroll} disabled={state.busy}>
            {state.busy ? "Setting up…" : "Set up private notes"}
          </PButton>
        </div>
      ) : !state.unlocked ? (
        <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          {passkeySlots.length > 0 ? (
            <div>
              <PButton
                tone="solid"
                onClick={session.unlockWithPasskey}
                disabled={state.busy}
              >
                Unlock with passkey
              </PButton>
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="sc4-recovery" style={fieldLabelStyle}>
              Recovery code
            </label>
            <input
              id="sc4-recovery"
              type="text"
              autoComplete="off"
              value={state.recoveryInput}
              onChange={(e) => session.setRecoveryInput(e.target.value)}
              style={fieldInputStyle}
              placeholder="XXXXX-XXXXX-…"
            />
            <div>
              <PButton
                tone="ghost"
                onClick={session.unlockWithRecovery}
                disabled={state.busy || state.recoveryInput.trim().length === 0}
              >
                Unlock with recovery code
              </PButton>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <textarea
            value={state.noteText}
            onChange={(e) => session.setNoteText(e.target.value)}
            rows={6}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 120 }}
            placeholder="A note only you can read…"
          />
          <div style={{ display: "flex", gap: 10 }}>
            <PButton tone="solid" onClick={session.save} disabled={state.busy}>
              {state.busy ? "Saving…" : "Save private note"}
            </PButton>
            <PButton tone="ghost" onClick={session.lock} disabled={state.busy}>
              Lock
            </PButton>
          </div>

          {/* Manage unlock methods (#113). */}
          <div
            style={{
              borderTop: `1px solid ${P.line}`,
              paddingTop: 14,
              marginTop: 4,
              display: "grid",
              gap: 10,
            }}
          >
            <h3 style={{ ...sectionTitleStyle, fontSize: 12, margin: 0 }}>
              Unlock methods
            </h3>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gap: 6,
              }}
            >
              {state.slots.map((slot) => (
                <li
                  key={slot.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    fontFamily: fontBody,
                    fontSize: 13,
                    color: P.ink,
                  }}
                >
                  <span>
                    {slot.slot_type === "recovery"
                      ? "Recovery code"
                      : slot.label || "Passkey"}
                    <span style={{ color: P.ink3 }}>
                      {slot.slot_type === "recovery" ? " (backstop)" : ""}
                    </span>
                  </span>
                  {slot.slot_type === "passkey" ? (
                    slot.id.startsWith("pending-") ? (
                      <span style={{ fontSize: 12, color: P.ink3 }}>
                        Reload to manage
                      </span>
                    ) : state.confirmRemoveId === slot.id ? (
                      <span style={{ display: "flex", gap: 6 }}>
                        <PButton
                          tone="terra"
                          size="sm"
                          onClick={() => {
                            session.setConfirmRemoveId(null);
                            session.removeSlot(slot.id);
                          }}
                          disabled={state.busy}
                        >
                          Confirm remove
                        </PButton>
                        <PButton
                          tone="ghost"
                          size="sm"
                          onClick={() => session.setConfirmRemoveId(null)}
                          disabled={state.busy}
                        >
                          Cancel
                        </PButton>
                      </span>
                    ) : (
                      <PButton
                        tone="ghost"
                        size="sm"
                        onClick={() => session.setConfirmRemoveId(slot.id)}
                        disabled={state.busy}
                      >
                        Remove
                      </PButton>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
            {state.confirmRemoveId ? (
              <p
                style={{
                  ...formNoteStyle,
                  margin: 0,
                  fontSize: 12,
                  color: "#923220",
                }}
              >
                Removing a passkey leaves fewer ways in. Make sure you still
                have your recovery code or another passkey before confirming —
                there is no server-side reset.
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {isPrfPasskeySupported() ? (
                <PButton
                  tone="ghost"
                  size="sm"
                  onClick={session.addPasskey}
                  disabled={state.busy}
                >
                  Add a passkey
                </PButton>
              ) : null}
              <PButton
                tone="ghost"
                size="sm"
                onClick={session.startRotateRecovery}
                disabled={state.busy}
              >
                Rotate recovery code
              </PButton>
            </div>
            <p style={{ ...formNoteStyle, margin: 0, fontSize: 12 }}>
              Lose every unlock method and these notes can never be recovered —
              there is no server-side reset.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

const cardStyle = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  padding: 20,
} as const;
