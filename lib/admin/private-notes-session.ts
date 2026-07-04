// The Private Care Note unlock-session state machine (#490), extracted from
// the shepherd-care shell so the security-sensitive orchestration is
// unit-testable without rendering a component. It owns the DEK lifecycle
// (unlock via passkey or recovery code, idle wipe, manual lock), the key-slot
// transitions (enroll, add passkey, rotate recovery code, remove slot), the
// one-time recovery-code presentation, and the editor/form state those flows
// drive.
//
// Boundaries (unchanged by the extraction):
//   * All cryptography stays in lib/crypto/private-notes — the verifiable
//     surface (ADR 0003). This module only sequences those primitives.
//   * All writes still go through the SC.4 server actions; the shell injects
//     them as the `actions` ports below, so this module never imports server
//     code and stays runnable in the node unit suite.
//   * Framework-free on purpose: the shell adapts it to React with
//     useSyncExternalStore and stays render-only.

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
import type { PrivateNoteKeySlotInput } from "@/lib/admin/validation";
import type { ActionResult } from "@/lib/shared/action-result";
import type {
  PrivateNoteCiphertext,
  PrivateNoteKeySlot,
} from "@/lib/supabase/shepherd-care-private-note-reads";

// dek_version 1 is the only generation today; the column exists so a future key
// rotation (#113+) can introduce generation 2 without a destructive migration.
export const DEK_VERSION = 1;

// In-memory DEK is wiped after this much inactivity (spec §7 / §11: a walk-up
// attacker on an unlocked machine must not keep read/write access). The fuller
// lockout UX is #113; this is the baseline idle wipe.
export const IDLE_WIPE_MS = 15 * 60 * 1000;

// What the editor decrypts on unlock: the latest persisted ciphertext.
export type PrivateNoteSavedNote = {
  ciphertext: string;
  iv: string;
  dek_version: number;
};

// The write ports the shell binds to the SC.4 server actions. Each takes the
// exact payload the shell used to pass and returns the shared action result
// envelope — the machine sequences them but never imports server code.
export type PrivateNotesSessionActions = {
  enrollKeys(input: {
    dek_version: number;
    slots: PrivateNoteKeySlotInput[];
    shepherd_profile_id: string;
  }): Promise<ActionResult<{ id: string }>>;
  upsertNote(input: {
    care_profile_id: string;
    set_body: boolean;
    ciphertext: string;
    iv: string;
    dek_version: number;
    shepherd_profile_id: string;
  }): Promise<ActionResult<{ id: string }>>;
  addKeySlot(input: {
    credential_id: string;
    label: string;
    prf_salt: string;
    hkdf_salt: string;
    wrapped_dek: string;
    wrap_iv: string;
    shepherd_profile_id: string;
  }): Promise<ActionResult<{ id: string }>>;
  rotateRecovery(input: {
    hkdf_salt: string;
    wrapped_dek: string;
    wrap_iv: string;
    label: string;
    shepherd_profile_id: string;
  }): Promise<ActionResult<{ id: string }>>;
  removeKeySlot(input: {
    slot_id: string;
    shepherd_profile_id: string;
  }): Promise<ActionResult<{ id: string }>>;
};

export type PrivateNotesSessionConfig = {
  careProfileId: string;
  creatorProfileId: string;
  shepherdProfileId: string;
  initialNote: PrivateNoteCiphertext | null;
  initialSlots: PrivateNoteKeySlot[];
  // WebAuthn relying-party id (the shell passes window.location.hostname);
  // injected so this module never touches `window`.
  getRpId: () => string;
  actions: PrivateNotesSessionActions;
};

export type PrivateNotesSessionState = {
  slots: PrivateNoteKeySlot[];
  dek: CryptoKey | null;
  noteText: string;
  // The latest persisted ciphertext, so a same-tab lock -> unlock decrypts the
  // newest note (not the stale initial prop) and never overwrites it blindly.
  savedNote: PrivateNoteSavedNote | null;
  // Enrollment recovery code: shown once and must be acknowledged before the
  // wrapped material is persisted.
  recoveryCode: string | null;
  recoveryAck: boolean;
  recoveryInput: string;
  // Recovery-code rotation: the new code is shown once and must be
  // acknowledged before the re-wrapped material is persisted.
  rotationCode: string | null;
  rotationAck: boolean;
  // Two-step passkey removal: removing your last hardware unlock method
  // leaves only the recovery code, so require an explicit confirmation first.
  confirmRemoveId: string | null;
  busy: boolean;
  error: string | null;
  status: string | null;
  // Derived (recomputed on every transition).
  enrolled: boolean;
  unlocked: boolean;
};

export type PrivateNotesSession = {
  getState(): PrivateNotesSessionState;
  subscribe(listener: () => void): () => void;
  // ---- DEK lifecycle.
  unlockWithPasskey(): Promise<void>;
  unlockWithRecovery(): Promise<void>;
  lock(): void;
  // Idle / pagehide wipe: clears the DEK and any in-flight one-time secret.
  wipe(): void;
  // Activity on the page resets the idle-wipe timer.
  recordActivity(): void;
  // Unmount: stop the idle timer without touching state.
  destroy(): void;
  // ---- enrollment + key-slot transitions.
  enroll(): Promise<void>;
  confirmEnrollment(): Promise<void>;
  addPasskey(): Promise<void>;
  startRotateRecovery(): Promise<void>;
  confirmRotateRecovery(): Promise<void>;
  removeSlot(slotId: string): Promise<void>;
  // ---- note editing.
  save(): Promise<void>;
  setNoteText(text: string): void;
  // ---- form-state setters.
  setRecoveryInput(text: string): void;
  setRecoveryAck(ack: boolean): void;
  setRotationAck(ack: boolean): void;
  setConfirmRemoveId(id: string | null): void;
};

export function passkeySlotsOf(
  slots: PrivateNoteKeySlot[]
): PrivateNoteKeySlot[] {
  return slots.filter(
    (s) => s.slot_type === "passkey" && s.credential_id && s.prf_salt
  );
}

export function recoverySlotOf(
  slots: PrivateNoteKeySlot[]
): PrivateNoteKeySlot | null {
  return slots.find((s) => s.slot_type === "recovery") ?? null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : "Something went wrong. Please try again.";
}

export function createPrivateNotesSession(
  config: PrivateNotesSessionConfig
): PrivateNotesSession {
  const { careProfileId, creatorProfileId, shepherdProfileId, actions } =
    config;

  let state: PrivateNotesSessionState = {
    slots: config.initialSlots,
    dek: null,
    noteText: "",
    savedNote: config.initialNote
      ? {
          ciphertext: config.initialNote.ciphertext,
          iv: config.initialNote.iv,
          dek_version: config.initialNote.dek_version,
        }
      : null,
    recoveryCode: null,
    recoveryAck: false,
    recoveryInput: "",
    rotationCode: null,
    rotationAck: false,
    confirmRemoveId: null,
    busy: false,
    error: null,
    status: null,
    enrolled: config.initialSlots.length > 0,
    unlocked: false,
  };

  const listeners = new Set<() => void>();

  function patch(partial: Partial<PrivateNotesSessionState>): void {
    const next = { ...state, ...partial };
    next.enrolled = next.slots.length > 0;
    next.unlocked = next.dek !== null;
    state = next;
    listeners.forEach((listener) => listener());
  }

  // Holds the wrapped slots generated client-side until the recovery code is
  // confirmed saved, then persists them.
  let pendingSlots: PrivateNoteKeySlotInput[] | null = null;
  // Re-wrapped recovery material held until the new code is acknowledged.
  let pendingRotation: {
    hkdf_salt: string;
    wrapped_dek: string;
    wrap_iv: string;
  } | null = null;

  // ---- idle wipe ----------------------------------------------------------

  // The timer runs only while a DEK is in memory: started whenever the DEK is
  // set (unlock / enrollment), reset by recordActivity, cleared on
  // lock / wipe / destroy.
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function clearIdleTimer(): void {
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  }

  function startIdleTimer(): void {
    clearIdleTimer();
    idleTimer = setTimeout(wipe, IDLE_WIPE_MS);
  }

  function recordActivity(): void {
    if (state.dek !== null) startIdleTimer();
  }

  function wipe(): void {
    if (state.dek === null) return;
    clearIdleTimer();
    // Also clear any in-flight one-time secret: a displayed enrollment or
    // rotation recovery code must not survive the lock for a walk-up attacker
    // to read and confirm without re-unlocking.
    pendingSlots = null;
    pendingRotation = null;
    patch({
      dek: null,
      noteText: "",
      status: null,
      recoveryCode: null,
      recoveryAck: false,
      rotationCode: null,
      rotationAck: false,
      error: "Locked after inactivity. Unlock again to view your note.",
    });
  }

  function destroy(): void {
    clearIdleTimer();
  }

  // The busy envelope every async flow shares: flip `busy` on (clearing the
  // prior error, and — for action flows — the prior status), run the body, map
  // a throw to a user-facing error, and always clear `busy` in `finally`. The
  // body may `return` early (e.g. on an `!result.ok` action failure after it has
  // already patched its own error); the `finally` still clears `busy`.
  async function runBusy(
    body: () => Promise<void>,
    options: { resetStatus?: boolean; onError?: (err: unknown) => string } = {}
  ): Promise<void> {
    patch({
      busy: true,
      error: null,
      ...(options.resetStatus ? { status: null } : {}),
    });
    try {
      await body();
    } catch (err) {
      patch({
        error: options.onError ? options.onError(err) : errorMessage(err),
      });
    } finally {
      patch({ busy: false });
    }
  }

  // ---- enrollment ---------------------------------------------------------

  async function enroll(): Promise<void> {
    return runBusy(
      async () => {
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
              rpId: config.getRpId(),
              rpName: "LifeGroups private notes",
              userName: "Private care notes",
              userDisplayName: "Private care notes",
            });
            const prfOutput = await evaluatePrf(
              credentialId,
              prfSalt,
              config.getRpId()
            );
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

        // Show the recovery code and require capture before persisting. Stash
        // the pending slots until the admin confirms they saved the code.
        patch({ recoveryCode: code, dek: newDek });
        startIdleTimer();
        pendingSlots = slotInputs;
      },
      { resetStatus: true }
    );
  }

  async function confirmEnrollment(): Promise<void> {
    const slotInputs = pendingSlots;
    if (!slotInputs) return;
    return runBusy(async () => {
      const result = await actions.enrollKeys({
        dek_version: DEK_VERSION,
        slots: slotInputs,
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        patch({ error: result.errors.join(" ") });
        return;
      }
      // Reflect enrollment locally with the REAL wrapped-key material so a
      // same-tab lock -> unlock works before the next server render. The
      // canonical rows (with ids) are re-fetched on navigation/revalidate.
      pendingSlots = null;
      patch({
        slots: slotInputs.map((s, i) => ({
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
        recoveryCode: null,
        recoveryAck: false,
        status:
          "Private notes are set up. Your DEK is unlocked for this session.",
      });
    });
  }

  // ---- unlock -------------------------------------------------------------

  // Returns true if the editor opened. When an existing note can't be
  // decrypted (tamper / corruption / version mismatch) we deliberately STAY
  // LOCKED so a later Save can't overwrite the undecryptable ciphertext.
  async function afterUnlock(unlockedDek: CryptoKey): Promise<boolean> {
    const saved = state.savedNote;
    if (saved) {
      try {
        const text = await decryptNote(
          unlockedDek,
          base64ToBytes(saved.ciphertext),
          base64ToBytes(saved.iv),
          buildNoteAad(careProfileId, creatorProfileId, saved.dek_version)
        );
        patch({ noteText: text });
      } catch {
        patch({
          error:
            "Unlocked, but your saved note couldn't be decrypted with that key. " +
            "Refresh the page or use another unlock method. Saving now would overwrite it.",
        });
        return false; // stay locked
      }
    }
    patch({ dek: unlockedDek });
    startIdleTimer();
    return true;
  }

  async function unlockWithRecovery(): Promise<void> {
    const recoverySlot = recoverySlotOf(state.slots);
    if (!recoverySlot) return;
    return runBusy(
      async () => {
        const kek = await deriveKekFromRecoveryCode(
          state.recoveryInput,
          base64ToBytes(recoverySlot.hkdf_salt)
        );
        const unlockedDek = await unwrapDek(
          base64ToBytes(recoverySlot.wrapped_dek),
          base64ToBytes(recoverySlot.wrap_iv),
          kek,
          buildWrapAad(creatorProfileId, recoverySlot.dek_version)
        );
        patch({ recoveryInput: "" });
        await afterUnlock(unlockedDek);
      },
      {
        onError: () =>
          "That recovery code didn't unlock your notes. Check it and try again.",
      }
    );
  }

  async function unlockWithPasskey(): Promise<void> {
    // Offer EVERY enrolled passkey to the authenticator in one assertion; it
    // responds with whichever credential this device actually holds. We then
    // unwrap with that specific slot's material — so a fresh device unlocks
    // with its own passkey, not only the first-enrolled one.
    const candidates = passkeySlotsOf(state.slots).flatMap((s) =>
      s.credential_id && s.prf_salt
        ? [
            {
              slot: s,
              credentialId: base64ToBytes(s.credential_id),
              prfSalt: base64ToBytes(s.prf_salt),
            },
          ]
        : []
    );
    if (candidates.length === 0) return;
    return runBusy(
      async () => {
        const { credentialId, prfOutput } = await evaluatePrfForCredentials(
          candidates.map((c) => ({
            credentialId: c.credentialId,
            prfSalt: c.prfSalt,
          })),
          config.getRpId()
        );
        const assertedB64 = bytesToBase64(credentialId);
        const match = candidates.find(
          (c) => c.slot.credential_id === assertedB64
        );
        if (!match)
          throw new Error(
            "No matching passkey slot for the asserted credential."
          );
        const kek = await deriveKekFromPrf(
          prfOutput,
          base64ToBytes(match.slot.hkdf_salt)
        );
        const unlockedDek = await unwrapDek(
          base64ToBytes(match.slot.wrapped_dek),
          base64ToBytes(match.slot.wrap_iv),
          kek,
          buildWrapAad(creatorProfileId, match.slot.dek_version)
        );
        await afterUnlock(unlockedDek);
      },
      {
        onError: () =>
          "Your passkey didn't unlock your notes. Try the recovery code instead.",
      }
    );
  }

  // ---- save ---------------------------------------------------------------

  async function save(): Promise<void> {
    const dek = state.dek;
    if (!dek) return;
    return runBusy(
      async () => {
        const { ciphertext, iv } = await encryptNote(
          dek,
          state.noteText,
          buildNoteAad(careProfileId, creatorProfileId, DEK_VERSION)
        );
        const ciphertextB64 = bytesToBase64(ciphertext);
        const ivB64 = bytesToBase64(iv);
        const result = await actions.upsertNote({
          care_profile_id: careProfileId,
          set_body: true,
          ciphertext: ciphertextB64,
          iv: ivB64,
          dek_version: DEK_VERSION,
          shepherd_profile_id: shepherdProfileId,
        });
        if (!result.ok) {
          patch({ error: result.errors.join(" ") });
          return;
        }
        // Keep the latest ciphertext so a same-tab lock -> unlock decrypts this
        // save, not the stale initial prop.
        patch({
          savedNote: {
            ciphertext: ciphertextB64,
            iv: ivB64,
            dek_version: DEK_VERSION,
          },
          status: "Saved. Encrypted on your device before it left the browser.",
        });
      },
      { resetStatus: true }
    );
  }

  function lock(): void {
    clearIdleTimer();
    patch({ dek: null, noteText: "", status: null });
  }

  // ---- manage unlock methods (#113) ----------------------------------------

  // Register a second passkey on this device and wrap the in-memory DEK into a
  // new slot. No note is re-encrypted. Also the fresh-device path: after a
  // recovery-code unlock, this enrolls a passkey on the new device.
  async function addPasskey(): Promise<void> {
    const dek = state.dek;
    if (!dek || !isPrfPasskeySupported()) return;
    return runBusy(
      async () => {
        const { credentialId, prfSalt } = await registerPrfPasskey({
          rpId: config.getRpId(),
          rpName: "LifeGroups private notes",
          userName: "Private care notes",
          userDisplayName: "Private care notes",
          // Don't overwrite an existing resident credential on the same
          // authenticator.
          excludeCredentialIds: passkeySlotsOf(state.slots)
            .map((s) => s.credential_id)
            .filter((c): c is string => c !== null)
            .map((c) => base64ToBytes(c)),
        });
        const prfOutput = await evaluatePrf(
          credentialId,
          prfSalt,
          config.getRpId()
        );
        const salt = newHkdfSalt();
        const kek = await deriveKekFromPrf(prfOutput, salt);
        const wrap = await wrapDek(
          dek,
          kek,
          buildWrapAad(creatorProfileId, DEK_VERSION)
        );
        const result = await actions.addKeySlot({
          credential_id: bytesToBase64(credentialId),
          label: "Passkey",
          prf_salt: bytesToBase64(prfSalt),
          hkdf_salt: bytesToBase64(salt),
          wrapped_dek: bytesToBase64(wrap.wrapped),
          wrap_iv: bytesToBase64(wrap.iv),
          shepherd_profile_id: shepherdProfileId,
        });
        if (!result.ok) {
          patch({ error: result.errors.join(" ") });
          return;
        }
        patch({
          slots: [
            ...state.slots,
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
          ],
          status: "Passkey added. This note now unlocks with it too.",
        });
      },
      { resetStatus: true }
    );
  }

  // Rotate the recovery code: generate a new one, re-wrap the in-memory DEK,
  // show it once, and only persist (revoking the old code) after the user
  // confirms.
  async function startRotateRecovery(): Promise<void> {
    const dek = state.dek;
    if (!dek) return;
    return runBusy(
      async () => {
        const code = generateRecoveryCode();
        const salt = newHkdfSalt();
        const kek = await deriveKekFromRecoveryCode(code, salt);
        const wrap = await wrapDek(
          dek,
          kek,
          buildWrapAad(creatorProfileId, DEK_VERSION)
        );
        pendingRotation = {
          hkdf_salt: bytesToBase64(salt),
          wrapped_dek: bytesToBase64(wrap.wrapped),
          wrap_iv: bytesToBase64(wrap.iv),
        };
        patch({ rotationAck: false, rotationCode: code });
      },
      { resetStatus: true }
    );
  }

  async function confirmRotateRecovery(): Promise<void> {
    const material = pendingRotation;
    if (!material) return;
    return runBusy(async () => {
      const result = await actions.rotateRecovery({
        ...material,
        label: "Recovery code",
        shepherd_profile_id: shepherdProfileId,
      });
      if (!result.ok) {
        patch({ error: result.errors.join(" ") });
        return;
      }
      pendingRotation = null;
      patch({
        slots: state.slots
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
        rotationCode: null,
        rotationAck: false,
        status: "Recovery code rotated. The old code no longer works.",
      });
    });
  }

  async function removeSlot(slotId: string): Promise<void> {
    return runBusy(
      async () => {
        const result = await actions.removeKeySlot({
          slot_id: slotId,
          shepherd_profile_id: shepherdProfileId,
        });
        if (!result.ok) {
          patch({ error: result.errors.join(" ") });
          return;
        }
        patch({
          slots: state.slots.filter((s) => s.id !== slotId),
          status: "Unlock method removed.",
        });
      },
      { resetStatus: true }
    );
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unlockWithPasskey,
    unlockWithRecovery,
    lock,
    wipe,
    recordActivity,
    destroy,
    enroll,
    confirmEnrollment,
    addPasskey,
    startRotateRecovery,
    confirmRotateRecovery,
    removeSlot,
    save,
    setNoteText: (text) => patch({ noteText: text }),
    setRecoveryInput: (text) => patch({ recoveryInput: text }),
    setRecoveryAck: (ack) => patch({ recoveryAck: ack }),
    setRotationAck: (ack) => patch({ rotationAck: ack }),
    setConfirmRemoveId: (id) => patch({ confirmRemoveId: id }),
  };
}
