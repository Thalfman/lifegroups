import { describe, expect, it } from "vitest";
import { isUuid, readUuidRpcData } from "@/lib/shared/uuid";

describe("readUuidRpcData", () => {
  it("returns null for non-string inputs", () => {
    expect(readUuidRpcData(undefined)).toBeNull();
    expect(readUuidRpcData(null)).toBeNull();
    expect(readUuidRpcData(42)).toBeNull();
    expect(readUuidRpcData(true)).toBeNull();
    expect(readUuidRpcData({})).toBeNull();
    expect(readUuidRpcData([])).toBeNull();
    expect(readUuidRpcData({ id: "11111111-1111-1111-1111-111111111111" })).toBeNull();
  });

  it("returns null for strings that are not uuids", () => {
    expect(readUuidRpcData("")).toBeNull();
    expect(readUuidRpcData("not-a-uuid")).toBeNull();
    expect(readUuidRpcData("11111111-1111-1111-1111")).toBeNull();
    expect(readUuidRpcData("zzzzzzzz-1111-1111-1111-111111111111")).toBeNull();
  });

  it("returns the lowercased canonical form for valid uuids", () => {
    const lower = "11111111-1111-1111-1111-111111111111";
    expect(readUuidRpcData(lower)).toBe(lower);

    const upper = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    expect(readUuidRpcData(upper)).toBe(upper.toLowerCase());

    const mixed = "AbCdEf12-3456-7890-aBcD-eF1234567890";
    expect(readUuidRpcData(mixed)).toBe(mixed.toLowerCase());
  });
});

describe("isUuid", () => {
  it("narrows valid uuid strings and rejects everything else", () => {
    expect(isUuid("11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
