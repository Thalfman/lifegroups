"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  adminEnrollPrivateNoteKeys,
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
import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import {
  buildNoteAad,
  buildWrapAad,
  decryptNote,
  deriveKekFromPrf,
  deriveKekFromRecoveryCode,
  encryptNote,
  evaluatePrf,
  generateDek,
  generateRecoveryCode,
  isPrfPasskeySupported,
  newHkdfSalt,
  registerPrfPasskey,
  unwrapDek,
  wrapDek,
} from "@/lib/crypto/private-notes";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { PrivateNoteKeySlotInput } from "@/lib/admin/validation";
import type { PrivateNoteCiphertext, PrivateNoteKeySlot } from "@/lib/supabase/read-models";

// dek_version 1 is the only generation today; the column exists so a future key
// rotation (#113+) can introduce generation 2 without a destructive migration.
const DEK_VERSION = 1;

// In-memory DEK is wiped after this much inactivity (spec §7 / §11: a walk-up
// attacker on an unlocked machine must not keep read/write access). The fuller
// lockout UX is #113; this is the baseline idle wipe.
const IDLE_WIPE_MS = 15 * 60 * 1000;

// What the editor decrypts on unlock: the latest persisted ciphertext.
type SavedNote = { ciphertext: string; iv: string; dek_version: number };

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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

export function PrivateNotesSection({
  careProfileId,
  creatorProfileId,
  shepherdProfileId,
  initialNote,
  initialSlots,
}: Props) {
  const [slots, setSlots] = useState<PrivateNoteKeySlot[]>(initialSlots);
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const [noteText, setNoteText] = useState("");
  // The latest persisted ciphertext, so a same-tab lock -> unlock decrypts the
  // newest note (not the stale initial prop) and never overwrites it blindly.
  const [savedNote, setSavedNote] = useState<SavedNote | null>(
    initialNote
      ? { ciphertext: initialNote.ciphertext, iv: initialNote.iv, dek_version: initialNote.dek_version }
      : null,
  );
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryAck, setRecoveryAck] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Holds the wrapped slots generated client-side until the recovery code is
  // confirmed saved, then persists them.
  const pendingSlots = useRef<PrivateNoteKeySlotInput[] | null>(null);

  const passkeySlot = useMemo(() => slots.find((s) => s.slot_type === "passkey") ?? null, [slots]);
  const recoverySlot = useMemo(
    () => slots.find((s) => s.slot_type === "recovery") ?? null,
    [slots],
  );

  const enrolled = slots.length > 0;
  const unlocked = dek !== null;

  // Wipe the in-memory DEK after IDLE_WIPE_MS of inactivity (spec §7/§11). With
  // the DEK gone the component falls back to the locked/unlock view, forcing a
  // re-unlock. Activity on the page resets the timer.
  useEffect(() => {
    if (!dek) return;
    let timer: ReturnType<typeof setTimeout>;
    const wipe = () => {
      setDek(null);
      setNoteText("");
      setStatus(null);
      setError("Locked after inactivity. Unlock again to view your note.");
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(wipe, IDLE_WIPE_MS);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "focus"];
    reset();
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [dek]);

  // ---- enrollment --------------------------------------------------------

  async function handleEnroll() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const newDek = await generateDek();
      const wrapAad = buildWrapAad(creatorProfileId, DEK_VERSION);
      const slotInputs: PrivateNoteKeySlotInput[] = [];

      // Mandatory recovery slot (the offline backstop / universal fallback).
      const code = generateRecoveryCode();
      const recoverySalt = newHkdfSalt();
      const recoveryKek = await deriveKekFromRecoveryCode(code, recoverySalt);
      const recoveryWrap = await wrapDek(newDek, recoveryKek, wrapAad);
      slotInputs.push({
        slot_type: "recovery",
        credential_id: null,
        label: "Recovery code",
        prf_salt: null,
        hkdf_salt: bytesToBase64(recoverySalt),
        wrapped_dek: bytesToBase64(recoveryWrap.wrapped),
        wrap_iv: bytesToBase64(recoveryWrap.iv),
      });

      // Optional passkey slot where the authenticator supports the PRF
      // extension. Best-effort: a cancelled/failed passkey falls back to
      // recovery-only enrollment.
      if (isPrfPasskeySupported()) {
        try {
          const { credentialId, prfSalt } = await registerPrfPasskey({
            rpId: window.location.hostname,
            rpName: "LifeGroups private notes",
            userId: new TextEncoder().encode(creatorProfileId),
            userName: "Private care notes",
            userDisplayName: "Private care notes",
          });
          const prfOutput = await evaluatePrf(credentialId, prfSalt, window.location.hostname);
          const passkeySalt = newHkdfSalt();
          const passkeyKek = await deriveKekFromPrf(prfOutput, passkeySalt);
          const passkeyWrap = await wrapDek(newDek, passkeyKek, wrapAad);
          slotInputs.push({
            slot_type: "passkey",
            credential_id: bytesToBase64(credentialId),
            label: "Passkey",
            prf_salt: bytesToBase64(prfSalt),
            hkdf_salt: bytesToBase64(passkeySalt),
            wrapped_dek: bytesToBase64(passkeyWrap.wrapped),
            wrap_iv: bytesToBase64(passkeyWrap.iv),
          });
        } catch {
          // Passkey unavailable / declined — continue with recovery only.
        }
      }

      // Show the recovery code and require capture before persisting.
      setRecoveryCode(code);
      setDek(newDek);
      // Stash the pending slots until the admin confirms they saved the code.
      pendingSlots.current = slotInputs;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmEnrollment() {
    const slotInputs = pendingSlots.current;
    if (!slotInputs) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminEnrollPrivateNoteKeys(undefined, {
        dek_version: DEK_VERSION,
        slots: slotInputs,
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        setError(result.errors.join(" "));
        return;
      }
      // Reflect enrollment locally with the REAL wrapped-key material so a
      // same-tab lock -> unlock works before the next server render. The
      // canonical rows (with ids) are re-fetched on navigation/revalidate.
      setSlots(
        slotInputs.map((s, i) => ({
          id: `pending-${i}`,
          created_by_profile_id: creatorProfileId,
          dek_version: DEK_VERSION,
          slot_type: s.slot_type,
          credential_id: s.credential_id,
          label: s.label,
          prf_salt: s.prf_salt,
          hkdf_salt: s.hkdf_salt,
          wrapped_dek: s.wrapped_dek,
          wrap_iv: s.wrap_iv,
          created_at: "",
        })),
      );
      pendingSlots.current = null;
      setRecoveryCode(null);
      setRecoveryAck(false);
      setStatus("Private notes are set up. Your DEK is unlocked for this session.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // ---- unlock ------------------------------------------------------------

  // Returns true if the editor opened. When an existing note can't be decrypted
  // (tamper / corruption / version mismatch) we deliberately STAY LOCKED so a
  // later Save can't overwrite the undecryptable ciphertext.
  async function afterUnlock(unlockedDek: CryptoKey): Promise<boolean> {
    if (savedNote) {
      try {
        const text = await decryptNote(
          unlockedDek,
          base64ToBytes(savedNote.ciphertext),
          base64ToBytes(savedNote.iv),
          buildNoteAad(careProfileId, creatorProfileId, savedNote.dek_version),
        );
        setNoteText(text);
      } catch {
        setError(
          "Unlocked, but your saved note couldn't be decrypted with that key. " +
            "Refresh the page or use another unlock method — saving now would overwrite it.",
        );
        return false; // stay locked
      }
    }
    setDek(unlockedDek);
    return true;
  }

  async function handleUnlockWithRecovery() {
    if (!recoverySlot) return;
    setBusy(true);
    setError(null);
    try {
      const kek = await deriveKekFromRecoveryCode(
        recoveryInput,
        base64ToBytes(recoverySlot.hkdf_salt),
      );
      const unlockedDek = await unwrapDek(
        base64ToBytes(recoverySlot.wrapped_dek),
        base64ToBytes(recoverySlot.wrap_iv),
        kek,
        buildWrapAad(creatorProfileId, recoverySlot.dek_version),
      );
      setRecoveryInput("");
      await afterUnlock(unlockedDek);
    } catch {
      setError("That recovery code didn't unlock your notes. Check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlockWithPasskey() {
    if (!passkeySlot || !passkeySlot.credential_id || !passkeySlot.prf_salt) return;
    setBusy(true);
    setError(null);
    try {
      const prfOutput = await evaluatePrf(
        base64ToBytes(passkeySlot.credential_id),
        base64ToBytes(passkeySlot.prf_salt),
        window.location.hostname,
      );
      const kek = await deriveKekFromPrf(prfOutput, base64ToBytes(passkeySlot.hkdf_salt));
      const unlockedDek = await unwrapDek(
        base64ToBytes(passkeySlot.wrapped_dek),
        base64ToBytes(passkeySlot.wrap_iv),
        kek,
        buildWrapAad(creatorProfileId, passkeySlot.dek_version),
      );
      await afterUnlock(unlockedDek);
    } catch {
      setError("Your passkey didn't unlock your notes. Try the recovery code instead.");
    } finally {
      setBusy(false);
    }
  }

  // ---- save --------------------------------------------------------------

  async function handleSave() {
    if (!dek) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const { ciphertext, iv } = await encryptNote(
        dek,
        noteText,
        buildNoteAad(careProfileId, creatorProfileId, DEK_VERSION),
      );
      const ciphertextB64 = bytesToBase64(ciphertext);
      const ivB64 = bytesToBase64(iv);
      const result = await adminUpsertShepherdCarePrivateNote(undefined, {
        care_profile_id: careProfileId,
        set_body: true,
        ciphertext: ciphertextB64,
        iv: ivB64,
        dek_version: DEK_VERSION,
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        setError(result.errors.join(" "));
        return;
      }
      // Keep the latest ciphertext so a same-tab lock -> unlock decrypts this
      // save, not the stale initial prop.
      setSavedNote({ ciphertext: ciphertextB64, iv: ivB64, dek_version: DEK_VERSION });
      setStatus("Saved. Encrypted on your device before it left the browser.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleLock() {
    setDek(null);
    setNoteText("");
    setStatus(null);
  }

  // ---- render ------------------------------------------------------------

  return (
    <section style={cardStyle} aria-label="Private notes (only you)">
      <h2 style={sectionTitleStyle}>Private notes (only you)</h2>
      <p style={formNoteStyle}>
        Encrypted on your device before it&apos;s saved. No one else — not other admins, and not
        the platform owner — can read it from the database or backups. If you lose every unlock
        method, the note can never be recovered.
      </p>

      {error ? (
        <p style={{ ...errorTextStyle, marginBottom: 12 }}>{error}</p>
      ) : null}
      {status ? (
        <p style={{ ...successTextStyle, marginBottom: 12 }}>{status}</p>
      ) : null}

      {/* Enrollment: show the recovery code once, require capture. */}
      {recoveryCode ? (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ ...formNoteStyle, margin: 0, color: P.ink }}>
            Save this recovery code now. It is shown once and is the only way back in if you lose
            your passkey.
          </p>
          <div style={codeStyle}>{recoveryCode}</div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontFamily: fontBody }}>
            <input
              type="checkbox"
              checked={recoveryAck}
              onChange={(e) => setRecoveryAck(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13, color: P.ink2 }}>
              I&apos;ve saved my recovery code — I understand a lost code means these notes can
              never be recovered.
            </span>
          </label>
          <div>
            <PButton
              tone="solid"
              onClick={handleConfirmEnrollment}
              disabled={!recoveryAck || busy}
            >
              {busy ? "Finishing…" : "Finish setup"}
            </PButton>
          </div>
        </div>
      ) : !enrolled ? (
        <div>
          <PButton tone="solid" onClick={handleEnroll} disabled={busy}>
            {busy ? "Setting up…" : "Set up private notes"}
          </PButton>
        </div>
      ) : !unlocked ? (
        <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          {passkeySlot ? (
            <div>
              <PButton tone="solid" onClick={handleUnlockWithPasskey} disabled={busy}>
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
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              style={fieldInputStyle}
              placeholder="XXXXX-XXXXX-…"
            />
            <div>
              <PButton
                tone="ghost"
                onClick={handleUnlockWithRecovery}
                disabled={busy || recoveryInput.trim().length === 0}
              >
                Unlock with recovery code
              </PButton>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={6}
            style={{ ...fieldInputStyle, resize: "vertical", minHeight: 120 }}
            placeholder="A note only you can read…"
          />
          <div style={{ display: "flex", gap: 10 }}>
            <PButton tone="solid" onClick={handleSave} disabled={busy}>
              {busy ? "Saving…" : "Save private note"}
            </PButton>
            <PButton tone="ghost" onClick={handleLock} disabled={busy}>
              Lock
            </PButton>
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
