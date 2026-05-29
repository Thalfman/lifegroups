// Transport encoding for the private-note bytea boundary. NON-CRYPTOGRAPHIC:
// these helpers only move already-encrypted bytes across the Postgres / JSON
// wire. They hold no keys and make no security decisions, so they live outside
// the verifiable crypto surface (lib/crypto/private-notes.ts).
//
// Wire contract (SC.4):
//   * WRITE path  — the client/server action sends bytea columns as base64
//     strings; the SECURITY DEFINER RPC decodes with decode(arg, 'base64').
//   * READ path   — PostgREST returns bytea in PostgreSQL's default `hex`
//     output, i.e. a string like "\x1a2b...". The read model normalises that
//     to base64 with pgHexToBase64 so the whole app/client layer speaks one
//     encoding (base64) in both directions.
//
// Dependency-free: implemented on plain string/array ops so the modules stay
// usable in both the browser and Node without btoa/atob or Buffer.

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_LOOKUP: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triple >> 18) & 0x3f];
    out += BASE64_ALPHABET[(triple >> 12) & 0x3f];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 0x3f] : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 0x3f] : "=";
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (let i = 0; i < base64.length; i += 1) {
    const code = base64.charCodeAt(i);
    const value = code < 128 ? BASE64_LOOKUP[code] : -1;
    if (value < 0) continue; // skip '=', whitespace, line breaks
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function pgHexToBytes(pgHex: string): Uint8Array {
  let hex = pgHex.trim();
  if (hex.startsWith("\\x") || hex.startsWith("\\X")) hex = hex.slice(2);
  const len = hex.length >> 1;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function pgHexToBase64(pgHex: string): string {
  return bytesToBase64(pgHexToBytes(pgHex));
}
