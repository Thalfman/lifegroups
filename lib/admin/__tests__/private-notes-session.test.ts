// Unit tests for the Private Care Note unlock-session state machine (#490).
// The machine is exercised directly — no component rendering. All pure
// cryptography (DEK generation, KEK derivation, wrap/unwrap, note
// encrypt/decrypt) is the REAL lib/crypto/private-notes implementation; only
// the WebAuthn passkey surface (navigator.credentials) is mocked, since no
// authenticator exists in the node suite.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEK_VERSION,
  IDLE_WIPE_MS,
  createPrivateNotesSession,
} from "@/lib/admin/private-notes-session";
import type {
  PrivateNotesSession,
  PrivateNotesSessionActions,
} from "@/lib/admin/private-notes-session";
import { base64ToBytes, bytesToBase64 } from "@/lib/crypto/encoding";
import {
  buildNoteAad,
  buildWrapAad,
  decryptNote,
  deriveKekFromPrf,
  deriveKekFromRecoveryCode,
  encryptNote,
  generateDek,
  generateRecoveryCode,
  newHkdfSalt,
  unwrapDek,
  wrapDek,
} from "@/lib/crypto/private-notes";
import { actionOk } from "@/lib/shared/action-result";
import type {
  PrivateNoteCiphertext,
  PrivateNoteKeySlot,
} from "@/lib/supabase/shepherd-care-reads";

// Mock ONLY the WebAuthn passkey surface of the crypto module; every other
// export is the real implementation (the module itself is never modified).
const webauthn = vi.hoisted(() => ({
  isPrfPasskeySupported: vi.fn(),
  registerPrfPasskey: vi.fn(),
  evaluatePrf: vi.fn(),
  evaluatePrfForCredentials: vi.fn(),
}));

vi.mock("@/lib/crypto/private-notes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/crypto/private-notes")>();
  return { ...actual, ...webauthn };
});

const CARE = "11111111-1111-1111-1111-111111111111";
const CREATOR = "22222222-2222-2222-2222-222222222222";
const SHEPHERD = "33333333-3333-3333-3333-333333333333";
const NOTE_TEXT = "a private pastoral note";

type EnrolledFixture = {
  dek: CryptoKey;
  recoveryCode: string;
  recoverySlot: PrivateNoteKeySlot;
  passkeySlot: PrivateNoteKeySlot;
  passkeyCredentialId: Uint8Array;
  passkeyPrfOutput: Uint8Array;
  note: PrivateNoteCiphertext;
};

// Build real enrolled key-slot rows + a saved note the way the app would:
// one DEK, wrapped under a recovery-code KEK and a passkey-PRF KEK, and a
// note ciphertext encrypted under that DEK with the production AAD.
async function buildEnrolled(): Promise<EnrolledFixture> {
  const dek = await generateDek();
  const wrapAad = buildWrapAad(CREATOR, DEK_VERSION);

  const recoveryCode = generateRecoveryCode();
  const recoverySalt = newHkdfSalt();
  const recoveryKek = await deriveKekFromRecoveryCode(
    recoveryCode,
    recoverySalt
  );
  const recoveryWrap = await wrapDek(dek, recoveryKek, wrapAad);
  const recoverySlot: PrivateNoteKeySlot = {
    id: "slot-recovery",
    created_by_profile_id: CREATOR,
    dek_version: DEK_VERSION,
    slot_type: "recovery",
    credential_id: null,
    label: "Recovery code",
    prf_salt: null,
    hkdf_salt: bytesToBase64(recoverySalt),
    wrapped_dek: bytesToBase64(recoveryWrap.wrapped),
    wrap_iv: bytesToBase64(recoveryWrap.iv),
    created_at: "",
  };

  const passkeyCredentialId = crypto.getRandomValues(new Uint8Array(16));
  const passkeyPrfOutput = crypto.getRandomValues(new Uint8Array(32));
  const passkeyPrfSalt = crypto.getRandomValues(new Uint8Array(32));
  const passkeySalt = newHkdfSalt();
  const passkeyKek = await deriveKekFromPrf(passkeyPrfOutput, passkeySalt);
  const passkeyWrap = await wrapDek(dek, passkeyKek, wrapAad);
  const passkeySlot: PrivateNoteKeySlot = {
    id: "slot-passkey",
    created_by_profile_id: CREATOR,
    dek_version: DEK_VERSION,
    slot_type: "passkey",
    credential_id: bytesToBase64(passkeyCredentialId),
    label: "Passkey",
    prf_salt: bytesToBase64(passkeyPrfSalt),
    hkdf_salt: bytesToBase64(passkeySalt),
    wrapped_dek: bytesToBase64(passkeyWrap.wrapped),
    wrap_iv: bytesToBase64(passkeyWrap.iv),
    created_at: "",
  };

  const enc = await encryptNote(
    dek,
    NOTE_TEXT,
    buildNoteAad(CARE, CREATOR, DEK_VERSION)
  );
  const note: PrivateNoteCiphertext = {
    id: "note-1",
    care_profile_id: CARE,
    created_by_profile_id: CREATOR,
    ciphertext: bytesToBase64(enc.ciphertext),
    iv: bytesToBase64(enc.iv),
    dek_version: DEK_VERSION,
    created_at: "",
    updated_at: "",
  };

  return {
    dek,
    recoveryCode,
    recoverySlot,
    passkeySlot,
    passkeyCredentialId,
    passkeyPrfOutput,
    note,
  };
}

function okActions() {
  return {
    enrollKeys: vi.fn<PrivateNotesSessionActions["enrollKeys"]>(async () =>
      actionOk({ id: "enrolled" })
    ),
    upsertNote: vi.fn<PrivateNotesSessionActions["upsertNote"]>(async () =>
      actionOk({ id: "note-1" })
    ),
    addKeySlot: vi.fn<PrivateNotesSessionActions["addKeySlot"]>(async () =>
      actionOk({ id: "slot-new" })
    ),
    rotateRecovery: vi.fn<PrivateNotesSessionActions["rotateRecovery"]>(
      async () => actionOk({ id: "slot-rotated" })
    ),
    removeKeySlot: vi.fn<PrivateNotesSessionActions["removeKeySlot"]>(
      async () => actionOk({ id: "slot-removed" })
    ),
  } satisfies PrivateNotesSessionActions;
}

function makeSession(opts: {
  slots: PrivateNoteKeySlot[];
  note?: PrivateNoteCiphertext | null;
  actions?: ReturnType<typeof okActions>;
}) {
  const actions = opts.actions ?? okActions();
  const session = createPrivateNotesSession({
    careProfileId: CARE,
    creatorProfileId: CREATOR,
    shepherdProfileId: SHEPHERD,
    initialNote: opts.note ?? null,
    initialSlots: opts.slots,
    getRpId: () => "localhost",
    actions,
  });
  return { session, actions };
}

async function unlockViaRecovery(
  session: PrivateNotesSession,
  code: string
): Promise<void> {
  session.setRecoveryInput(code);
  await session.unlockWithRecovery();
}

beforeEach(() => {
  vi.useFakeTimers();
  webauthn.isPrfPasskeySupported.mockReset();
  webauthn.isPrfPasskeySupported.mockReturnValue(true);
  webauthn.registerPrfPasskey.mockReset();
  webauthn.evaluatePrf.mockReset();
  webauthn.evaluatePrfForCredentials.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("unlock via recovery code", () => {
  it("unlocks and decrypts the saved note", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.recoverySlot], note: f.note });

    await unlockViaRecovery(session, f.recoveryCode);

    const state = session.getState();
    expect(state.unlocked).toBe(true);
    expect(state.dek).not.toBeNull();
    expect(state.noteText).toBe(NOTE_TEXT);
    expect(state.recoveryInput).toBe(""); // cleared on success
    expect(state.error).toBeNull();
    expect(state.busy).toBe(false);
  });

  it("rejects a wrong code and stays locked", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.recoverySlot], note: f.note });
    const wrongCode = generateRecoveryCode();

    await unlockViaRecovery(session, wrongCode);

    const state = session.getState();
    expect(state.unlocked).toBe(false);
    expect(state.dek).toBeNull();
    expect(state.noteText).toBe("");
    expect(state.error).toBe(
      "That recovery code didn't unlock your notes. Check it and try again."
    );
    // The typed code is only cleared once it actually unlocked.
    expect(state.recoveryInput).toBe(wrongCode);
  });

  it("stays locked when the saved note cannot be decrypted with that key", async () => {
    const f = await buildEnrolled();
    // A note encrypted under a DIFFERENT DEK: tamper/corruption stand-in.
    const otherDek = await generateDek();
    const enc = await encryptNote(
      otherDek,
      "unreachable",
      buildNoteAad(CARE, CREATOR, DEK_VERSION)
    );
    const foreignNote: PrivateNoteCiphertext = {
      ...f.note,
      ciphertext: bytesToBase64(enc.ciphertext),
      iv: bytesToBase64(enc.iv),
    };
    const { session } = makeSession({
      slots: [f.recoverySlot],
      note: foreignNote,
    });

    await unlockViaRecovery(session, f.recoveryCode);

    const state = session.getState();
    // Deliberately stays locked so a Save can't overwrite the ciphertext.
    expect(state.unlocked).toBe(false);
    expect(state.dek).toBeNull();
    expect(state.error).toContain("couldn't be decrypted");
  });

  it("does nothing when no recovery slot exists", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.passkeySlot] });

    session.setRecoveryInput(f.recoveryCode);
    await session.unlockWithRecovery();

    expect(session.getState().unlocked).toBe(false);
    expect(session.getState().error).toBeNull();
  });
});

describe("unlock via passkey", () => {
  it("unlocks with the slot matching the asserted credential", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({
      slots: [f.recoverySlot, f.passkeySlot],
      note: f.note,
    });
    webauthn.evaluatePrfForCredentials.mockResolvedValue({
      credentialId: f.passkeyCredentialId,
      prfOutput: f.passkeyPrfOutput,
    });

    await session.unlockWithPasskey();

    const state = session.getState();
    expect(state.unlocked).toBe(true);
    expect(state.noteText).toBe(NOTE_TEXT);
    expect(state.error).toBeNull();
    // Every enrolled passkey was offered in one assertion, with the rp id.
    const [candidates, rpId] = webauthn.evaluatePrfForCredentials.mock.calls[0];
    expect(rpId).toBe("localhost");
    expect(candidates).toHaveLength(1);
    expect(bytesToBase64(candidates[0].credentialId)).toBe(
      f.passkeySlot.credential_id
    );
  });

  it("stays locked when the assertion fails", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({
      slots: [f.recoverySlot, f.passkeySlot],
      note: f.note,
    });
    webauthn.evaluatePrfForCredentials.mockRejectedValue(
      new Error("user cancelled")
    );

    await session.unlockWithPasskey();

    const state = session.getState();
    expect(state.unlocked).toBe(false);
    expect(state.error).toBe(
      "Your passkey didn't unlock your notes. Try the recovery code instead."
    );
  });

  it("returns early when no passkey slots exist", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.recoverySlot] });

    await session.unlockWithPasskey();

    expect(webauthn.evaluatePrfForCredentials).not.toHaveBeenCalled();
    expect(session.getState().unlocked).toBe(false);
    expect(session.getState().error).toBeNull();
  });
});

describe("idle wipe", () => {
  it("wipes the DEK and editor after IDLE_WIPE_MS of inactivity", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.recoverySlot], note: f.note });
    await unlockViaRecovery(session, f.recoveryCode);
    expect(session.getState().unlocked).toBe(true);

    vi.advanceTimersByTime(IDLE_WIPE_MS);

    const state = session.getState();
    expect(state.dek).toBeNull();
    expect(state.unlocked).toBe(false);
    expect(state.noteText).toBe("");
    expect(state.status).toBeNull();
    expect(state.error).toBe(
      "Locked after inactivity. Unlock again to view your note."
    );
  });

  it("recordActivity resets the idle timer", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.recoverySlot], note: f.note });
    await unlockViaRecovery(session, f.recoveryCode);

    vi.advanceTimersByTime(IDLE_WIPE_MS - 1);
    session.recordActivity();
    vi.advanceTimersByTime(IDLE_WIPE_MS - 1);
    expect(session.getState().unlocked).toBe(true);

    vi.advanceTimersByTime(1);
    expect(session.getState().unlocked).toBe(false);
    expect(session.getState().dek).toBeNull();
  });

  it("wipe() (pagehide) clears the DEK and any one-time secret", async () => {
    webauthn.isPrfPasskeySupported.mockReturnValue(false);
    const { session, actions } = makeSession({ slots: [] });
    await session.enroll();
    expect(session.getState().recoveryCode).not.toBeNull();
    expect(session.getState().unlocked).toBe(true);

    session.wipe();

    const state = session.getState();
    expect(state.dek).toBeNull();
    expect(state.recoveryCode).toBeNull();
    expect(state.recoveryAck).toBe(false);
    // The pending wrapped slots were dropped with the code: confirming after
    // the wipe must not persist anything.
    await session.confirmEnrollment();
    expect(actions.enrollKeys).not.toHaveBeenCalled();
  });

  it("idle wipe clears an in-flight rotation code and its material", async () => {
    const f = await buildEnrolled();
    const { session, actions } = makeSession({
      slots: [f.recoverySlot],
      note: f.note,
    });
    await unlockViaRecovery(session, f.recoveryCode);
    await session.startRotateRecovery();
    expect(session.getState().rotationCode).not.toBeNull();

    vi.advanceTimersByTime(IDLE_WIPE_MS);

    expect(session.getState().rotationCode).toBeNull();
    expect(session.getState().rotationAck).toBe(false);
    await session.confirmRotateRecovery();
    expect(actions.rotateRecovery).not.toHaveBeenCalled();
  });

  it("lock() clears the DEK and editor without the inactivity error", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.recoverySlot], note: f.note });
    await unlockViaRecovery(session, f.recoveryCode);

    session.lock();

    const state = session.getState();
    expect(state.dek).toBeNull();
    expect(state.noteText).toBe("");
    expect(state.status).toBeNull();
    expect(state.error).toBeNull();
  });

  it("destroy() stops the idle timer", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.recoverySlot], note: f.note });
    await unlockViaRecovery(session, f.recoveryCode);

    session.destroy();
    vi.advanceTimersByTime(IDLE_WIPE_MS);

    // No timer left to fire after unmount.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("enrollment and one-time recovery-code exposure", () => {
  it("shows the code first and persists only after confirmation", async () => {
    webauthn.isPrfPasskeySupported.mockReturnValue(false);
    const { session, actions } = makeSession({ slots: [] });

    await session.enroll();

    const shown = session.getState().recoveryCode;
    expect(shown).not.toBeNull();
    expect(session.getState().unlocked).toBe(true);
    // One-time exposure precedes persistence: nothing written yet.
    expect(actions.enrollKeys).not.toHaveBeenCalled();

    await session.confirmEnrollment();

    expect(actions.enrollKeys).toHaveBeenCalledTimes(1);
    const input = actions.enrollKeys.mock.calls[0][0];
    expect(input.dek_version).toBe(DEK_VERSION);
    expect(input.shepherd_profile_id).toBe(SHEPHERD);
    expect(input.slots).toHaveLength(1);
    expect(input.slots[0].slot_type).toBe("recovery");
    const state = session.getState();
    // The code is gone after confirmation — shown exactly once.
    expect(state.recoveryCode).toBeNull();
    expect(state.slots.map((s) => s.id)).toEqual(["pending-0"]);
    expect(state.status).toBe(
      "Private notes are set up. Your DEK is unlocked for this session."
    );
  });

  it("adds a passkey slot when the authenticator supports PRF", async () => {
    const credentialId = crypto.getRandomValues(new Uint8Array(16));
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const prfOutput = crypto.getRandomValues(new Uint8Array(32));
    webauthn.registerPrfPasskey.mockResolvedValue({ credentialId, prfSalt });
    webauthn.evaluatePrf.mockResolvedValue(prfOutput);
    const { session, actions } = makeSession({ slots: [] });

    await session.enroll();
    await session.confirmEnrollment();

    const input = actions.enrollKeys.mock.calls[0][0];
    expect(input.slots.map((s) => s.slot_type)).toEqual([
      "recovery",
      "passkey",
    ]);
    expect(input.slots[1].credential_id).toBe(bytesToBase64(credentialId));
    expect(input.slots[1].prf_salt).toBe(bytesToBase64(prfSalt));
  });

  it("falls back to recovery-only enrollment when the passkey fails", async () => {
    webauthn.registerPrfPasskey.mockRejectedValue(new Error("declined"));
    const { session, actions } = makeSession({ slots: [] });

    await session.enroll();
    await session.confirmEnrollment();

    const input = actions.enrollKeys.mock.calls[0][0];
    expect(input.slots.map((s) => s.slot_type)).toEqual(["recovery"]);
  });

  it("keeps the code visible and retryable when the write fails", async () => {
    webauthn.isPrfPasskeySupported.mockReturnValue(false);
    const { session, actions } = makeSession({ slots: [] });
    actions.enrollKeys.mockResolvedValueOnce({
      ok: false,
      errors: ["Private notes couldn't be set up. Please try again."],
    });

    await session.enroll();
    const shown = session.getState().recoveryCode;
    await session.confirmEnrollment();

    expect(session.getState().error).toBe(
      "Private notes couldn't be set up. Please try again."
    );
    expect(session.getState().recoveryCode).toBe(shown);
    expect(session.getState().slots).toHaveLength(0);

    await session.confirmEnrollment(); // retry succeeds
    expect(actions.enrollKeys).toHaveBeenCalledTimes(2);
    expect(session.getState().slots).toHaveLength(1);
  });

  it("the shown code unlocks what the session later saves (wire round-trip)", async () => {
    webauthn.isPrfPasskeySupported.mockReturnValue(false);
    const { session, actions } = makeSession({ slots: [] });

    await session.enroll();
    const code = session.getState().recoveryCode;
    await session.confirmEnrollment();
    session.setNoteText("first private note");
    await session.save();

    // Decrypt what was sent to the server using ONLY the displayed code and
    // the persisted slot material — proves the key-slot and ciphertext wire
    // shapes are coherent end to end.
    const slot = actions.enrollKeys.mock.calls[0][0].slots[0];
    const saved = actions.upsertNote.mock.calls[0][0];
    const kek = await deriveKekFromRecoveryCode(
      code as string,
      base64ToBytes(slot.hkdf_salt)
    );
    const dek = await unwrapDek(
      base64ToBytes(slot.wrapped_dek),
      base64ToBytes(slot.wrap_iv),
      kek,
      buildWrapAad(CREATOR, DEK_VERSION)
    );
    const plaintext = await decryptNote(
      dek,
      base64ToBytes(saved.ciphertext),
      base64ToBytes(saved.iv),
      buildNoteAad(CARE, CREATOR, DEK_VERSION)
    );
    expect(plaintext).toBe("first private note");
    expect(saved.care_profile_id).toBe(CARE);
    expect(saved.set_body).toBe(true);
    expect(saved.dek_version).toBe(DEK_VERSION);
  });
});

describe("save", () => {
  it("persists ciphertext that a same-tab lock -> unlock decrypts", async () => {
    const f = await buildEnrolled();
    const { session } = makeSession({ slots: [f.recoverySlot], note: f.note });
    await unlockViaRecovery(session, f.recoveryCode);

    session.setNoteText("updated note");
    await session.save();
    expect(session.getState().status).toBe(
      "Saved. Encrypted on your device before it left the browser."
    );

    session.lock();
    await unlockViaRecovery(session, f.recoveryCode);
    // Decrypts the freshly saved ciphertext, not the stale initial prop.
    expect(session.getState().noteText).toBe("updated note");
  });

  it("does nothing while locked", async () => {
    const f = await buildEnrolled();
    const { session, actions } = makeSession({
      slots: [f.recoverySlot],
      note: f.note,
    });

    await session.save();

    expect(actions.upsertNote).not.toHaveBeenCalled();
  });

  it("keeps the previous saved note when the write fails", async () => {
    const f = await buildEnrolled();
    const { session, actions } = makeSession({
      slots: [f.recoverySlot],
      note: f.note,
    });
    actions.upsertNote.mockResolvedValueOnce({
      ok: false,
      errors: ["The private note wasn't saved. Please try again."],
    });
    await unlockViaRecovery(session, f.recoveryCode);

    session.setNoteText("won't persist");
    await session.save();
    expect(session.getState().error).toBe(
      "The private note wasn't saved. Please try again."
    );

    session.lock();
    await unlockViaRecovery(session, f.recoveryCode);
    expect(session.getState().noteText).toBe(NOTE_TEXT);
  });
});

describe("key-slot transitions", () => {
  it("addPasskey wraps the SAME DEK into a new slot (no note re-encryption)", async () => {
    const f = await buildEnrolled();
    const { session, actions } = makeSession({
      slots: [f.recoverySlot],
      note: f.note,
    });
    await unlockViaRecovery(session, f.recoveryCode);

    const credentialId = crypto.getRandomValues(new Uint8Array(16));
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const prfOutput = crypto.getRandomValues(new Uint8Array(32));
    webauthn.registerPrfPasskey.mockResolvedValue({ credentialId, prfSalt });
    webauthn.evaluatePrf.mockResolvedValue(prfOutput);

    await session.addPasskey();

    const state = session.getState();
    expect(state.status).toBe(
      "Passkey added. This note now unlocks with it too."
    );
    expect(state.slots.map((s) => s.id)).toEqual(["slot-recovery", "slot-new"]);
    // The new slot's wrapped material unwraps to a DEK that still decrypts
    // the ORIGINAL note ciphertext — the DEK was re-wrapped, not replaced.
    const sent = actions.addKeySlot.mock.calls[0][0];
    const kek = await deriveKekFromPrf(
      prfOutput,
      base64ToBytes(sent.hkdf_salt)
    );
    const dek = await unwrapDek(
      base64ToBytes(sent.wrapped_dek),
      base64ToBytes(sent.wrap_iv),
      kek,
      buildWrapAad(CREATOR, DEK_VERSION)
    );
    const plaintext = await decryptNote(
      dek,
      base64ToBytes(f.note.ciphertext),
      base64ToBytes(f.note.iv),
      buildNoteAad(CARE, CREATOR, DEK_VERSION)
    );
    expect(plaintext).toBe(NOTE_TEXT);
  });

  it("addPasskey requires an unlocked session", async () => {
    const f = await buildEnrolled();
    const { session, actions } = makeSession({ slots: [f.recoverySlot] });

    await session.addPasskey();

    expect(webauthn.registerPrfPasskey).not.toHaveBeenCalled();
    expect(actions.addKeySlot).not.toHaveBeenCalled();
  });

  it("rotation shows the new code once; the old code stops working", async () => {
    const f = await buildEnrolled();
    const { session, actions } = makeSession({
      slots: [f.recoverySlot],
      note: f.note,
    });
    await unlockViaRecovery(session, f.recoveryCode);

    await session.startRotateRecovery();
    const newCode = session.getState().rotationCode;
    expect(newCode).not.toBeNull();
    expect(newCode).not.toBe(f.recoveryCode);
    // Nothing persisted (old code not revoked) until the user confirms.
    expect(actions.rotateRecovery).not.toHaveBeenCalled();

    await session.confirmRotateRecovery();

    const state = session.getState();
    expect(actions.rotateRecovery).toHaveBeenCalledTimes(1);
    expect(state.rotationCode).toBeNull(); // shown exactly once
    expect(state.status).toBe(
      "Recovery code rotated. The old code no longer works."
    );
    expect(state.slots.filter((s) => s.slot_type === "recovery")).toHaveLength(
      1
    );
    expect(state.slots.find((s) => s.id === "slot-recovery")).toBeUndefined();

    // The OLD code no longer unlocks; the NEW code does, and the same note
    // still decrypts (same DEK, re-wrapped).
    session.lock();
    await unlockViaRecovery(session, f.recoveryCode);
    expect(session.getState().unlocked).toBe(false);
    await unlockViaRecovery(session, newCode as string);
    expect(session.getState().unlocked).toBe(true);
    expect(session.getState().noteText).toBe(NOTE_TEXT);
  });

  it("removeSlot drops the slot once the action succeeds", async () => {
    const f = await buildEnrolled();
    const { session, actions } = makeSession({
      slots: [f.recoverySlot, f.passkeySlot],
      note: f.note,
    });

    await session.removeSlot("slot-passkey");

    expect(actions.removeKeySlot).toHaveBeenCalledWith({
      slot_id: "slot-passkey",
      shepherd_profile_id: SHEPHERD,
    });
    expect(session.getState().slots.map((s) => s.id)).toEqual([
      "slot-recovery",
    ]);
    expect(session.getState().status).toBe("Unlock method removed.");
  });

  it("removeSlot keeps the slot when the action fails", async () => {
    const f = await buildEnrolled();
    const { session, actions } = makeSession({
      slots: [f.recoverySlot, f.passkeySlot],
      note: f.note,
    });
    actions.removeKeySlot.mockResolvedValueOnce({
      ok: false,
      errors: ["The unlock method couldn't be removed. Please try again."],
    });

    await session.removeSlot("slot-passkey");

    expect(session.getState().slots).toHaveLength(2);
    expect(session.getState().error).toBe(
      "The unlock method couldn't be removed. Please try again."
    );
  });
});
