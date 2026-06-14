import { describe, expect, it } from "vitest";

import {
  decideInstallAffordance,
  isIosSafari,
  type InstallAffordance,
} from "@/lib/pwa/install";

// A few representative real-world user-agent strings.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

describe("isIosSafari", () => {
  it("is true for Safari on iPhone and iPad", () => {
    expect(isIosSafari(UA.iphoneSafari)).toBe(true);
    expect(isIosSafari(UA.ipadSafari)).toBe(true);
  });

  it("is false for non-Safari iOS browsers (different share flow)", () => {
    expect(isIosSafari(UA.iphoneChrome)).toBe(false);
  });

  it("is false for non-iOS browsers", () => {
    expect(isIosSafari(UA.androidChrome)).toBe(false);
    expect(isIosSafari(UA.desktopChrome)).toBe(false);
  });
});

describe("decideInstallAffordance", () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof decideInstallAffordance>[0];
    expected: InstallAffordance;
  }> = [
    {
      name: "already installed (standalone) hides everywhere",
      input: { standalone: true, iosSafari: true, hasDeferredPrompt: true },
      expected: "hidden",
    },
    {
      name: "a captured native prompt wins",
      input: { standalone: false, iosSafari: false, hasDeferredPrompt: true },
      expected: "native",
    },
    {
      name: "iOS Safari without a prompt falls back to the guide",
      input: { standalone: false, iosSafari: true, hasDeferredPrompt: false },
      expected: "ios-guide",
    },
    {
      name: "desktop Chrome without a prompt stays hidden",
      input: { standalone: false, iosSafari: false, hasDeferredPrompt: false },
      expected: "hidden",
    },
  ];

  for (const { name, input, expected } of cases) {
    it(name, () => {
      expect(decideInstallAffordance(input)).toBe(expected);
    });
  }
});
