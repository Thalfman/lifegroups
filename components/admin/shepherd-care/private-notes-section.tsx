"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import {
  buildNoteAad,
  buildWrapAad,
  decryptNote,
  deriveKekFromPrf,
  deriveKekFromRecoveryCode,
  encryptNote,
  evaluatePrf,
  evaluatePrfForCredentials,
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
  // Recovery-code rotation: the new code is shown once and must be acknowledged
  // before the re-wrapped material is persisted.
  const [rotationCode, setRotationCode] = useState<string | null>(null);
  const [rotationAck, setRotationAck] = useState(false);
  // Two-step passkey removal: removing your last hardware unlock method leaves
  // only the recovery code, so require an explicit confirmation first.
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const pendingRotation = useRef<{ hkdf_salt: string; wrapped_dek: string; wrap_iv: string } | null>(
    null,
  );

  const passkeySlots = useMemo(
    () => slots.filter((s) => s.slot_type === "passkey" && s.credential_id && s.prf_salt),
    [slots],
  );
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
      // Also clear any in-flight one-time secret: a displayed enrollment or
      // rotation recovery code must not survive the lock for a walk-up attacker
      // to read and confirm without re-unlocking.
      setRecoveryCode(null);
      setRecoveryAck(false);
      setRotationCode(null);
      setRotationAck(false);
      pendingSlots.current = null;
      pendingRotation.current = null;
      setError("Locked after inactivity. Unlock again to view your note.");
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(wipe, IDLE_WIPE_MS);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "focus"];
    reset();
    events.forEach((e) => window.addEventListener(e, reset));
    // Wipe on tab/page close (spec §7). pagehide also fires on SPA navigation away.
    window.addEventListener("pagehide", wipe);
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
      window.removeEventListener("pagehide", wipe);
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
    // Offer EVERY enrolled passkey to the authenticator in one assertion; it
    // responds with whichever credential this device actually holds. We then
    // unwrap with that specific slot's material — so a fresh device unlocks with
    // its own passkey, not only the first-enrolled one.
    const candidates = passkeySlots.flatMap((s) =>
      s.credential_id && s.prf_salt
        ? [{ slot: s, credentialId: base64ToBytes(s.credential_id), prfSalt: base64ToBytes(s.prf_salt) }]
        : [],
    );
    if (candidates.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const { credentialId, prfOutput } = await evaluatePrfForCredentials(
        candidates.map((c) => ({ credentialId: c.credentialId, prfSalt: c.prfSalt })),
        window.location.hostname,
      );
      const assertedB64 = bytesToBase64(credentialId);
      const match = candidates.find((c) => c.slot.credential_id === assertedB64);
      if (!match) throw new Error("No matching passkey slot for the asserted credential.");
      const kek = await deriveKekFromPrf(prfOutput, base64ToBytes(match.slot.hkdf_salt));
      const unlockedDek = await unwrapDek(
        base64ToBytes(match.slot.wrapped_dek),
        base64ToBytes(match.slot.wrap_iv),
        kek,
        buildWrapAad(creatorProfileId, match.slot.dek_version),
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

  // ---- manage unlock methods (#113) --------------------------------------

  // Register a second passkey on this device and wrap the in-memory DEK into a
  // new slot. No note is re-encrypted. Also the fresh-device path: after a
  // recovery-code unlock, this enrolls a passkey on the new device.
  async function handleAddPasskey() {
    if (!dek || !isPrfPasskeySupported()) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const { credentialId, prfSalt } = await registerPrfPasskey({
        rpId: window.location.hostname,
        rpName: "LifeGroups private notes",
        userName: "Private care notes",
        userDisplayName: "Private care notes",
        // Don't overwrite an existing resident credential on the same authenticator.
        excludeCredentialIds: passkeySlots
          .map((s) => s.credential_id)
          .filter((c): c is string => c !== null)
          .map((c) => base64ToBytes(c)),
      });
      const prfOutput = await evaluatePrf(credentialId, prfSalt, window.location.hostname);
      const salt = newHkdfSalt();
      const kek = await deriveKekFromPrf(prfOutput, salt);
      const wrap = await wrapDek(dek, kek, buildWrapAad(creatorProfileId, DEK_VERSION));
      const result = await adminAddPrivateNoteKeySlot(undefined, {
        credential_id: bytesToBase64(credentialId),
        label: "Passkey",
        prf_salt: bytesToBase64(prfSalt),
        hkdf_salt: bytesToBase64(salt),
        wrapped_dek: bytesToBase64(wrap.wrapped),
        wrap_iv: bytesToBase64(wrap.iv),
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        setError(result.errors.join(" "));
        return;
      }
      setSlots((prev) => [
        ...prev,
        {
          id: result.value.id,
          created_by_profile_id: creatorProfileId,
          dek_version: DEK_VERSION,
          slot_type: "passkey",
          credential_id: bytesToBase64(credentialId),
          label: "Passkey",
          prf_salt: bytesToBase64(prfSalt),
          hkdf_salt: bytesToBase64(salt),
          wrapped_dek: bytesToBase64(wrap.wrapped),
          wrap_iv: bytesToBase64(wrap.iv),
          created_at: "",
        },
      ]);
      setStatus("Passkey added. This note now unlocks with it too.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Rotate the recovery code: generate a new one, re-wrap the in-memory DEK, show
  // it once, and only persist (revoking the old code) after the user confirms.
  async function handleStartRotateRecovery() {
    if (!dek) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const code = generateRecoveryCode();
      const salt = newHkdfSalt();
      const kek = await deriveKekFromRecoveryCode(code, salt);
      const wrap = await wrapDek(dek, kek, buildWrapAad(creatorProfileId, DEK_VERSION));
      pendingRotation.current = {
        hkdf_salt: bytesToBase64(salt),
        wrapped_dek: bytesToBase64(wrap.wrapped),
        wrap_iv: bytesToBase64(wrap.iv),
      };
      setRotationAck(false);
      setRotationCode(code);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmRotateRecovery() {
    const material = pendingRotation.current;
    if (!material) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminRotatePrivateNoteRecovery(undefined, {
        ...material,
        label: "Recovery code",
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        setError(result.errors.join(" "));
        return;
      }
      setSlots((prev) =>
        prev
          .filter((s) => s.slot_type !== "recovery")
          .concat({
            id: result.value.id,
            created_by_profile_id: creatorProfileId,
            dek_version: DEK_VERSION,
            slot_type: "recovery",
            credential_id: null,
            label: "Recovery code",
            prf_salt: null,
            hkdf_salt: material.hkdf_salt,
            wrapped_dek: material.wrapped_dek,
            wrap_iv: material.wrap_iv,
            created_at: "",
          }),
      );
      pendingRotation.current = null;
      setRotationCode(null);
      setRotationAck(false);
      setStatus("Recovery code rotated. The old code no longer works.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSlot(slotId: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await adminRemovePrivateNoteKeySlot(undefined, {
        slot_id: slotId,
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        setError(result.errors.join(" "));
        return;
      }
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      setStatus("Unlock method removed.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
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

      {/* Recovery-code rotation: show the NEW code once, require capture, then
          persist (revoking the old code). */}
      {rotationCode ? (
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ ...formNoteStyle, margin: 0, color: P.ink }}>
            Save this <strong>new</strong> recovery code now. It replaces your old one — the old
            code stops working the moment you confirm. Shown once.
          </p>
          <div style={codeStyle}>{rotationCode}</div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontFamily: fontBody }}>
            <input
              type="checkbox"
              checked={rotationAck}
              onChange={(e) => setRotationAck(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span style={{ fontSize: 13, color: P.ink2 }}>
              I&apos;ve saved my new recovery code — I understand losing all unlock methods means
              these notes can never be recovered.
            </span>
          </label>
          <div>
            <PButton tone="solid" onClick={handleConfirmRotateRecovery} disabled={!rotationAck || busy}>
              {busy ? "Rotating…" : "Confirm new recovery code"}
            </PButton>
          </div>
        </div>
      ) : /* Enrollment: show the recovery code once, require capture. */
      recoveryCode ? (
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
          {passkeySlots.length > 0 ? (
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
            <h3 style={{ ...sectionTitleStyle, fontSize: 12, margin: 0 }}>Unlock methods</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
              {slots.map((slot) => (
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
                    {slot.slot_type === "recovery" ? "Recovery code" : slot.label || "Passkey"}
                    <span style={{ color: P.ink3 }}>
                      {slot.slot_type === "recovery" ? " (backstop)" : ""}
                    </span>
                  </span>
                  {slot.slot_type === "passkey" ? (
                    slot.id.startsWith("pending-") ? (
                      <span style={{ fontSize: 12, color: P.ink3 }}>Reload to manage</span>
                    ) : confirmRemoveId === slot.id ? (
                      <span style={{ display: "flex", gap: 6 }}>
                        <PButton
                          tone="terra"
                          size="sm"
                          onClick={() => {
                            setConfirmRemoveId(null);
                            handleRemoveSlot(slot.id);
                          }}
                          disabled={busy}
                        >
                          Confirm remove
                        </PButton>
                        <PButton
                          tone="ghost"
                          size="sm"
                          onClick={() => setConfirmRemoveId(null)}
                          disabled={busy}
                        >
                          Cancel
                        </PButton>
                      </span>
                    ) : (
                      <PButton
                        tone="ghost"
                        size="sm"
                        onClick={() => setConfirmRemoveId(slot.id)}
                        disabled={busy}
                      >
                        Remove
                      </PButton>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
            {confirmRemoveId ? (
              <p style={{ ...formNoteStyle, margin: 0, fontSize: 12, color: "#923220" }}>
                Removing a passkey leaves fewer ways in. Make sure you still have your recovery code
                or another passkey before confirming — there is no server-side reset.
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {isPrfPasskeySupported() ? (
                <PButton tone="ghost" size="sm" onClick={handleAddPasskey} disabled={busy}>
                  Add a passkey
                </PButton>
              ) : null}
              <PButton tone="ghost" size="sm" onClick={handleStartRotateRecovery} disabled={busy}>
                Rotate recovery code
              </PButton>
            </div>
            <p style={{ ...formNoteStyle, margin: 0, fontSize: 12 }}>
              Lose every unlock method and these notes can never be recovered — there is no
              server-side reset.
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
