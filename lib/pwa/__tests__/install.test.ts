import { describe, expect, it } from "vitest";

import {
  decideInstallAffordance,
  detectPlatform,
  isIosSafari,
  shouldShowInstallNudge,
  type InstallAffordance,
  type InstallPlatform,
} from "@/lib/pwa/install";

// A few representative real-world user-agent strings.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/604.1",
  // iPadOS desktop-class Safari and a real Mac Safari share this exact UA — only
  // navigator.maxTouchPoints tells them apart.
  macOrIpadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15",
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

  it("treats a touch-capable Macintosh-UA Safari as iPadOS desktop mode", () => {
    expect(isIosSafari(UA.macOrIpadSafari, 5)).toBe(true);
  });

  it("treats the same UA without touch points as a real Mac", () => {
    expect(isIosSafari(UA.macOrIpadSafari, 0)).toBe(false);
  });
});

describe("detectPlatform", () => {
  it("names the iOS browser so the guided steps can match it", () => {
    expect(detectPlatform(UA.iphoneSafari)).toEqual({
      ios: true,
      android: false,
      iosBrowser: "safari",
    });
    expect(detectPlatform(UA.iphoneChrome)).toEqual({
      ios: true,
      android: false,
      iosBrowser: "chrome",
    });
    expect(detectPlatform(UA.iphoneFirefox)).toEqual({
      ios: true,
      android: false,
      iosBrowser: "other",
    });
  });

  it("detects Android", () => {
    expect(detectPlatform(UA.androidChrome)).toEqual({
      ios: false,
      android: true,
      iosBrowser: "safari",
    });
  });

  it("treats desktop Chrome as neither iOS nor Android", () => {
    expect(detectPlatform(UA.desktopChrome)).toEqual({
      ios: false,
      android: false,
      iosBrowser: "safari",
    });
  });

  it("resolves the iPadOS-vs-Mac ambiguity via touch points", () => {
    expect(detectPlatform(UA.macOrIpadSafari, 5).ios).toBe(true);
    expect(detectPlatform(UA.macOrIpadSafari, 0).ios).toBe(false);
  });
});

describe("decideInstallAffordance", () => {
  const ios = (browser: InstallPlatform["iosBrowser"]): InstallPlatform => ({
    ios: true,
    android: false,
    iosBrowser: browser,
  });
  const android: InstallPlatform = {
    ios: false,
    android: true,
    iosBrowser: "safari",
  };
  const desktop: InstallPlatform = {
    ios: false,
    android: false,
    iosBrowser: "safari",
  };

  const cases: Array<{
    name: string;
    input: Parameters<typeof decideInstallAffordance>[0];
    expected: InstallAffordance;
  }> = [
    {
      name: "already installed (standalone) hides everywhere",
      input: { standalone: true, hasDeferredPrompt: true, platform: android },
      expected: { kind: "hidden" },
    },
    {
      name: "a captured native prompt wins",
      input: { standalone: false, hasDeferredPrompt: true, platform: android },
      expected: { kind: "native" },
    },
    {
      name: "iOS Safari without a prompt gets the Safari guide",
      input: {
        standalone: false,
        hasDeferredPrompt: false,
        platform: ios("safari"),
      },
      expected: { kind: "guide", guide: "ios-safari" },
    },
    {
      name: "iOS Chrome without a prompt gets the Chrome guide (no dead end)",
      input: {
        standalone: false,
        hasDeferredPrompt: false,
        platform: ios("chrome"),
      },
      expected: { kind: "guide", guide: "ios-chrome" },
    },
    {
      name: "other iOS browsers get the generic iOS guide",
      input: {
        standalone: false,
        hasDeferredPrompt: false,
        platform: ios("other"),
      },
      expected: { kind: "guide", guide: "ios-other" },
    },
    {
      name: "Android without a prompt falls back to the menu guide",
      input: { standalone: false, hasDeferredPrompt: false, platform: android },
      expected: { kind: "guide", guide: "android" },
    },
    {
      name: "desktop without a prompt stays hidden",
      input: { standalone: false, hasDeferredPrompt: false, platform: desktop },
      expected: { kind: "hidden" },
    },
  ];

  for (const { name, input, expected } of cases) {
    it(name, () => {
      expect(decideInstallAffordance(input)).toEqual(expected);
    });
  }
});

describe("shouldShowInstallNudge", () => {
  const mobile: InstallPlatform = {
    ios: true,
    android: false,
    iosBrowser: "safari",
  };
  const desktop: InstallPlatform = {
    ios: false,
    android: false,
    iosBrowser: "safari",
  };

  it("shows on mobile when there is something to install", () => {
    expect(
      shouldShowInstallNudge({
        affordance: { kind: "guide", guide: "ios-safari" },
        platform: mobile,
        dismissed: false,
      })
    ).toBe(true);
  });

  it("stays hidden once dismissed", () => {
    expect(
      shouldShowInstallNudge({
        affordance: { kind: "guide", guide: "ios-safari" },
        platform: mobile,
        dismissed: true,
      })
    ).toBe(false);
  });

  it("stays hidden when the app is already installed (hidden affordance)", () => {
    expect(
      shouldShowInstallNudge({
        affordance: { kind: "hidden" },
        platform: mobile,
        dismissed: false,
      })
    ).toBe(false);
  });

  it("never nudges on desktop, even with a native prompt", () => {
    expect(
      shouldShowInstallNudge({
        affordance: { kind: "native" },
        platform: desktop,
        dismissed: false,
      })
    ).toBe(false);
  });
});
