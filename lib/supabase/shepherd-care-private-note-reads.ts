import { pgHexToBase64 } from "@/lib/crypto/encoding";
import {
  columns,
  wrapError,
  type ReadClient,
  type ReadResult,
} from "./read-core";

// ---------------------------------------------------------------------------
// Phase SC.4 — private care note (creator-scoped, E2E-encrypted) read models.
// One sub-domain of the former shepherd-care-reads module; its siblings are
// shepherd-care-directory-reads, shepherd-care-interaction-reads,
// shepherd-care-follow-up-reads, and shepherd-coverage-reads. Both SC.4
// tables' readers live in THIS one file so the sc4 no-leak fitness suite
// (lib/supabase/__tests__/sc4-no-leak-exclusion.test.ts) can pin a single
// allowlisted read path.
// ---------------------------------------------------------------------------

type RawPrivateNoteCiphertext = {
  id: string;
  care_profile_id: string;
  created_by_profile_id: string;
  ciphertext: string;
  iv: string;
  dek_version: number;
  created_at: string;
  updated_at: string;
};

type RawPrivateNoteKeySlot = {
  id: string;
  created_by_profile_id: string;
  dek_version: number;
  slot_type: "passkey" | "recovery";
  credential_id: string | null;
  label: string | null;
  prf_salt: string | null;
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
  created_at: string;
};

/**
 * Phase SC.4 private care notes. Creator-scoped column allowlists; never
 * select("*"). The body column is opaque AES-256-GCM ciphertext — the server
 * never holds plaintext or the key. Both readers run behind requireAdmin() and
 * filter on created_by_profile_id (belt-and-braces with the creator-scoped RLS
 * that excludes super_admin). No leader / co_leader / over_shepherd /
 * super_admin read path exists.
 */
export const SHEPHERD_CARE_PRIVATE_NOTE_COLUMNS =
  columns<RawPrivateNoteCiphertext>()(
    "id",
    "care_profile_id",
    "created_by_profile_id",
    "ciphertext",
    "iv",
    "dek_version",
    "created_at",
    "updated_at"
  );

export const SHEPHERD_CARE_KEY_SLOT_COLUMNS = columns<RawPrivateNoteKeySlot>()(
  "id",
  "created_by_profile_id",
  "dek_version",
  "slot_type",
  "credential_id",
  "label",
  "prf_salt",
  "hkdf_salt",
  "wrapped_dek",
  "wrap_iv",
  "created_at"
);

// Read-shape DTOs. The bytea columns arrive from PostgREST in hex output and
// are normalised to base64 here so the whole app/client layer speaks one
// encoding (see lib/crypto/encoding.ts).
export type PrivateNoteCiphertext = {
  id: string;
  care_profile_id: string;
  created_by_profile_id: string;
  ciphertext: string; // base64
  iv: string; // base64
  dek_version: number;
  created_at: string;
  updated_at: string;
};

export type PrivateNoteKeySlot = {
  id: string;
  created_by_profile_id: string;
  dek_version: number;
  slot_type: "passkey" | "recovery";
  credential_id: string | null; // base64
  label: string | null;
  prf_salt: string | null; // base64
  hkdf_salt: string; // base64
  wrapped_dek: string; // base64
  wrap_iv: string; // base64
  created_at: string;
};

// PostgREST default bytea output is hex ("\\x..."); some deployments emit
// base64. Normalise hex to base64 and pass an already-base64 value through.
function byteaToBase64(value: string): string {
  return value.startsWith("\\x") || value.startsWith("\\X")
    ? pgHexToBase64(value)
    : value;
}

function nullableByteaToBase64(value: string | null): string | null {
  return value === null || value === undefined ? null : byteaToBase64(value);
}

/**
 * The calling admin's own private-note ciphertext for one care profile. Behind
 * requireAdmin(); creator-scoped RLS additionally guarantees a caller can only
 * read their own row. Returns ciphertext + iv normalised to base64.
 */
export async function fetchShepherdCarePrivateNoteCiphertextForCreator(
  client: ReadClient,
  careProfileId: string,
  creatorProfileId: string
): Promise<ReadResult<PrivateNoteCiphertext | null>> {
  const { data, error } = await client
    .from("shepherd_care_private_notes")
    .select(SHEPHERD_CARE_PRIVATE_NOTE_COLUMNS.select)
    .eq("care_profile_id", careProfileId)
    .eq("created_by_profile_id", creatorProfileId)
    .maybeSingle();
  if (error) {
    return {
      data: null,
      error: wrapError(
        "fetchShepherdCarePrivateNoteCiphertextForCreator",
        error
      ),
    };
  }
  if (data === null || data === undefined) return { data: null, error: null };
  const row = data as RawPrivateNoteCiphertext;
  return {
    data: {
      id: row.id,
      care_profile_id: row.care_profile_id,
      created_by_profile_id: row.created_by_profile_id,
      ciphertext: byteaToBase64(row.ciphertext),
      iv: byteaToBase64(row.iv),
      dek_version: row.dek_version,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    error: null,
  };
}

/**
 * The calling admin's own wrapped-DEK key slots. Behind requireAdmin();
 * creator-scoped RLS additionally fences the slot table. Bytea fields
 * normalised to base64; recovery slots keep credential_id / prf_salt null.
 */
export async function fetchPrivateNoteKeySlotsForCreator(
  client: ReadClient,
  creatorProfileId: string
): Promise<ReadResult<PrivateNoteKeySlot[]>> {
  const { data, error } = await client
    .from("shepherd_care_note_key_slots")
    .select(SHEPHERD_CARE_KEY_SLOT_COLUMNS.select)
    .eq("created_by_profile_id", creatorProfileId)
    .order("created_at", { ascending: true });
  if (error) {
    return {
      data: null,
      error: wrapError("fetchPrivateNoteKeySlotsForCreator", error),
    };
  }
  const rows = (data ?? []) as RawPrivateNoteKeySlot[];
  return {
    data: rows.map((row) => ({
      id: row.id,
      created_by_profile_id: row.created_by_profile_id,
      dek_version: row.dek_version,
      slot_type: row.slot_type,
      credential_id: nullableByteaToBase64(row.credential_id),
      label: row.label,
      prf_salt: nullableByteaToBase64(row.prf_salt),
      hkdf_salt: byteaToBase64(row.hkdf_salt),
      wrapped_dek: byteaToBase64(row.wrapped_dek),
      wrap_iv: byteaToBase64(row.wrap_iv),
      created_at: row.created_at,
    })),
    error: null,
  };
}
