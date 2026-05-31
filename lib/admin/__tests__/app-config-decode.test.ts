import { describe, it, expect } from "vitest";
import {
  BUILT_IN_APP_CONFIG,
  decodeAppConfig,
} from "@/lib/admin/app-config-decode";

describe("decodeAppConfig", () => {
  it("returns the built-in defaults for a null row", () => {
    expect(decodeAppConfig(null)).toEqual(BUILT_IN_APP_CONFIG);
  });

  it("reads a stored console_tracer_note string", () => {
    const config = decodeAppConfig({
      setting_value: { console_tracer_note: "Launch window opens Monday" },
    });
    expect(config.consoleTracerNote).toBe("Launch window opens Monday");
  });

  it("preserves an explicitly empty note (a valid cleared value)", () => {
    const config = decodeAppConfig({
      setting_value: { console_tracer_note: "" },
    });
    expect(config.consoleTracerNote).toBe("");
  });

  it("falls back to the default when the key is missing", () => {
    const config = decodeAppConfig({ setting_value: { unrelated: 1 } });
    expect(config.consoleTracerNote).toBe(
      BUILT_IN_APP_CONFIG.consoleTracerNote
    );
  });

  it("falls back to the default when the note is the wrong type", () => {
    expect(
      decodeAppConfig({ setting_value: { console_tracer_note: 42 } })
        .consoleTracerNote
    ).toBe(BUILT_IN_APP_CONFIG.consoleTracerNote);
    expect(
      decodeAppConfig({ setting_value: { console_tracer_note: null } })
        .consoleTracerNote
    ).toBe(BUILT_IN_APP_CONFIG.consoleTracerNote);
  });

  it("ignores a non-object setting_value", () => {
    expect(decodeAppConfig({ setting_value: "nope" })).toEqual(
      BUILT_IN_APP_CONFIG
    );
    expect(decodeAppConfig({ setting_value: null })).toEqual(
      BUILT_IN_APP_CONFIG
    );
    expect(decodeAppConfig({ setting_value: [1, 2, 3] })).toEqual(
      BUILT_IN_APP_CONFIG
    );
  });

  it("ignores unknown keys, decoding only the whitelisted shape", () => {
    const config = decodeAppConfig({
      setting_value: {
        console_tracer_note: "kept",
        future_flag: true,
        injected: { nested: "ignored" },
      },
    });
    expect(config).toEqual({
      consoleTracerNote: "kept",
      featureFlags: {},
      editableCopy: {},
    });
  });
});
