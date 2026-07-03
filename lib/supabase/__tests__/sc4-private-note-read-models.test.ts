import { describe, expect, it } from "vitest";

import { bytesToBase64 } from "@/lib/crypto/encoding";
import {
  fetchPrivateNoteKeySlotsForCreator,
  fetchShepherdCarePrivateNoteCiphertextForCreator,
} from "@/lib/supabase/shepherd-care-private-note-reads";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const CARE = "11111111-1111-1111-1111-111111111111";
const CREATOR = "22222222-2222-2222-2222-222222222222";

const b64 = (bytes: number[]) => bytesToBase64(Uint8Array.from(bytes));
const hex = (bytes: number[]) =>
  "\\x" + bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

// Records the filter chain and resolves to fixture rows. Mirrors the thenable
// query-builder mock used across the read-model tests (no DB).
function makeClient(fixture: { single?: unknown; list?: unknown[] }) {
  const eqCalls: Array<[string, unknown]> = [];
  let lastTable = "";
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      eqCalls.push([col, val]);
      return builder;
    },
    order: () => builder,
    maybeSingle: async () => ({ data: fixture.single ?? null, error: null }),
    then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
      Promise.resolve({ data: fixture.list ?? [], error: null }).then(onF, onR),
  };
  const client = {
    from: (t: string) => {
      lastTable = t;
      return builder;
    },
  } as unknown as AppSupabaseClient;
  return { client, eqCalls, table: () => lastTable };
}

describe("fetchShepherdCarePrivateNoteCiphertextForCreator", () => {
  it("normalises hex bytea to base64 and filters on care profile + creator", async () => {
    const { client, eqCalls } = makeClient({
      single: {
        id: "99999999-9999-9999-9999-999999999999",
        care_profile_id: CARE,
        created_by_profile_id: CREATOR,
        ciphertext: hex([1, 2, 3, 4]),
        iv: hex([5, 6, 7]),
        dek_version: 1,
        created_at: "2026-05-29T00:00:00Z",
        updated_at: "2026-05-29T00:00:00Z",
      },
    });

    const result = await fetchShepherdCarePrivateNoteCiphertextForCreator(
      client,
      CARE,
      CREATOR
    );
    expect(result.error).toBeNull();
    expect(result.data?.ciphertext).toBe(b64([1, 2, 3, 4]));
    expect(result.data?.iv).toBe(b64([5, 6, 7]));
    expect(result.data?.dek_version).toBe(1);
    expect(eqCalls).toContainEqual(["care_profile_id", CARE]);
    expect(eqCalls).toContainEqual(["created_by_profile_id", CREATOR]);
  });

  it("returns { data: null } when the creator has no note yet", async () => {
    const { client } = makeClient({ single: null });
    const result = await fetchShepherdCarePrivateNoteCiphertextForCreator(
      client,
      CARE,
      CREATOR
    );
    expect(result).toEqual({ data: null, error: null });
  });
});

describe("fetchPrivateNoteKeySlotsForCreator", () => {
  it("normalises each slot's bytea fields and keeps nulls null; filters on creator", async () => {
    const { client, eqCalls } = makeClient({
      list: [
        {
          id: "88888888-8888-8888-8888-888888888888",
          created_by_profile_id: CREATOR,
          dek_version: 1,
          slot_type: "recovery",
          credential_id: null,
          label: "Recovery code",
          prf_salt: null,
          hkdf_salt: hex([10, 11]),
          wrapped_dek: hex([12, 13, 14]),
          wrap_iv: hex([15]),
          created_at: "2026-05-29T00:00:00Z",
        },
      ],
    });

    const result = await fetchPrivateNoteKeySlotsForCreator(client, CREATOR);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    const slot = result.data![0];
    expect(slot.slot_type).toBe("recovery");
    expect(slot.credential_id).toBeNull();
    expect(slot.prf_salt).toBeNull();
    expect(slot.hkdf_salt).toBe(b64([10, 11]));
    expect(slot.wrapped_dek).toBe(b64([12, 13, 14]));
    expect(slot.wrap_iv).toBe(b64([15]));
    expect(eqCalls).toContainEqual(["created_by_profile_id", CREATOR]);
  });

  it("returns an empty array when there are no slots", async () => {
    const { client } = makeClient({ list: [] });
    const result = await fetchPrivateNoteKeySlotsForCreator(client, CREATOR);
    expect(result).toEqual({ data: [], error: null });
  });
});
