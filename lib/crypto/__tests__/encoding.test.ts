import { describe, expect, it } from "vitest";

import {
  base64ToBytes,
  bytesToBase64,
  pgHexToBase64,
  pgHexToBytes,
} from "@/lib/crypto/encoding";

const utf8 = (s: string) => new TextEncoder().encode(s);

describe("base64 transport codec", () => {
  it("encodes a known vector", () => {
    expect(bytesToBase64(utf8("hello"))).toBe("aGVsbG8=");
  });

  it("round-trips arbitrary bytes including empty", () => {
    for (const len of [0, 1, 2, 3, 16, 31, 32, 100, 255]) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) bytes[i] = (i * 37 + 11) % 256;
      const round = base64ToBytes(bytesToBase64(bytes));
      expect(Array.from(round)).toEqual(Array.from(bytes));
    }
  });

  it("decodes the known vector back to bytes", () => {
    expect(Array.from(base64ToBytes("aGVsbG8="))).toEqual(Array.from(utf8("hello")));
  });
});

describe("postgres bytea hex codec", () => {
  it("decodes a leading-\\x lowercase hex string", () => {
    // 'hello' = 68 65 6c 6c 6f
    expect(Array.from(pgHexToBytes("\\x68656c6c6f"))).toEqual(Array.from(utf8("hello")));
  });

  it("tolerates uppercase hex", () => {
    expect(Array.from(pgHexToBytes("\\x68656C6C6F"))).toEqual(Array.from(utf8("hello")));
  });

  it("decodes empty bytea (just the \\x prefix)", () => {
    expect(Array.from(pgHexToBytes("\\x"))).toEqual([]);
  });

  it("pgHexToBase64 matches bytesToBase64 of the decoded bytes", () => {
    expect(pgHexToBase64("\\x68656c6c6f")).toBe(bytesToBase64(utf8("hello")));
  });
});
