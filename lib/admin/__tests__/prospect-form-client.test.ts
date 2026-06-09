import { describe, expect, it } from "vitest";
import {
  FULL_NAME_REQUIRED_MESSAGE,
  prospectFormClientErrors,
} from "@/lib/admin/validation/prospect-form-client";

describe("prospectFormClientErrors — Add prospect inline validation", () => {
  it("flags an empty full name with the accessible message", () => {
    expect(prospectFormClientErrors({ fullName: "" })).toEqual({
      fullName: FULL_NAME_REQUIRED_MESSAGE,
    });
    expect(FULL_NAME_REQUIRED_MESSAGE).toBe("Full name is required.");
  });

  it("treats a whitespace-only name as empty (matches the server trim)", () => {
    expect(prospectFormClientErrors({ fullName: "   " })).toEqual({
      fullName: FULL_NAME_REQUIRED_MESSAGE,
    });
  });

  it("passes a real name with no errors", () => {
    expect(prospectFormClientErrors({ fullName: "Avery Bennett" })).toEqual({});
  });
});
