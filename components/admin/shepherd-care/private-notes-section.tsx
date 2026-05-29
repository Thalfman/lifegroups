"use client";

import { useMemo, useRef, useState } from "react";

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
import type { PrivateNoteCiphertext, PrivateNoteKeySlot } from "@/lib/supabase/read-models";

// dek_version 1 is the only generation today; the column exists so a future key
// rotation (#113+) can introduce generation 2 without a destructive migration.
const DEK_VERSION = 1;

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
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryAck, setRecoveryAck] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // Holds the wrapped slots generated client-side until the recovery code is
  // confirmed saved, then persists them.
  const pendingSlots = useRef<Array<Record<string, unknown>> | null>(null);

  const passkeySlot = useMemo(() => slots.find((s) => s.slot_type === "passkey") ?? null, [slots]);
  const recoverySlot = useMemo(
    () => slots.find((s) => s.slot_type === "recovery") ?? null,
    [slots],
  );

  const enrolled = slots.length > 0;
  const unlocked = dek !== null;

  // ---- enrollment --------------------------------------------------------

  async function handleEnroll() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const newDek = await generateDek();
      const wrapAad = buildWrapAad(creatorProfileId, DEK_VERSION);
      const slotInputs: Array<Record<string, unknown>> = [];

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
    if (!pendingSlots.current) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminEnrollPrivateNoteKeys(undefined, {
        dek_version: DEK_VERSION,
        slots: pendingSlots.current as never,
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        setError(result.errors.join(" "));
        return;
      }
      // Reflect enrollment locally so the editor opens without a reload. The
      // exact slot rows are re-fetched on the next server render.
      setSlots([
        { slot_type: "recovery" } as PrivateNoteKeySlot,
        ...(pendingSlots.current.length > 1
          ? [{ slot_type: "passkey" } as PrivateNoteKeySlot]
          : []),
      ]);
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

  async function afterUnlock(unlockedDek: CryptoKey) {
    setDek(unlockedDek);
    if (initialNote) {
      try {
        const text = await decryptNote(
          unlockedDek,
          base64ToBytes(initialNote.ciphertext),
          base64ToBytes(initialNote.iv),
          buildNoteAad(careProfileId, creatorProfileId, initialNote.dek_version),
        );
        setNoteText(text);
      } catch {
        setError("Unlocked, but this note couldn't be decrypted with that key.");
      }
    }
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
      const result = await adminUpsertShepherdCarePrivateNote(undefined, {
        care_profile_id: careProfileId,
        set_body: true,
        ciphertext: bytesToBase64(ciphertext),
        iv: bytesToBase64(iv),
        dek_version: DEK_VERSION,
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        setError(result.errors.join(" "));
        return;
      }
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
