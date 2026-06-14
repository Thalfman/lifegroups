import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getSupportContact,
  PLACEHOLDER_SUPPORT_EMAIL,
  supportMailtoHref,
} from "@/lib/support/contact";

describe("getSupportContact", () => {
  const original = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_SUPPORT_EMAIL = original;
  });

  it("falls back to a non-personal placeholder when unconfigured", () => {
    const contact = getSupportContact();
    expect(contact.email).toBe(PLACEHOLDER_SUPPORT_EMAIL);
    expect(contact.isPlaceholder).toBe(true);
    // The placeholder must be a shared functional inbox, not an individual.
    expect(contact.email).not.toMatch(/@(gmail|outlook|yahoo|icloud)\./);
  });

  it("uses the configured address when present, trimmed", () => {
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "  help@church.example  ";
    const contact = getSupportContact();
    expect(contact.email).toBe("help@church.example");
    expect(contact.isPlaceholder).toBe(false);
  });

  it("treats a blank configured value as unconfigured", () => {
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "   ";
    expect(getSupportContact().isPlaceholder).toBe(true);
  });
});

describe("supportMailtoHref", () => {
  const contact = { email: "help@church.example", isPlaceholder: false };

  it("builds a bare mailto without a subject", () => {
    expect(supportMailtoHref(contact)).toBe("mailto:help@church.example");
  });

  it("encodes the subject so spaces/punctuation can't break the href", () => {
    expect(supportMailtoHref(contact, "Help me & you")).toBe(
      "mailto:help@church.example?subject=Help%20me%20%26%20you"
    );
  });
});
