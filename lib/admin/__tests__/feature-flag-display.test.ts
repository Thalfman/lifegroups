import { describe, expect, it } from "vitest";
import {
  buildFeatureFlagRow,
  buildFeatureFlagRows,
} from "@/lib/admin/feature-flag-display";
import {
  FEATURE_FLAG_DEFINITIONS,
  getFeatureFlagDefinition,
  type FeatureFlagDefinition,
} from "@/lib/admin/feature-flags";

// Real registry definitions, so the rows exercise the same resolveFlag path
// the console uses (an unknown key would fail safe to Off and prove nothing).
function definition(key: string): FeatureFlagDefinition {
  const def = getFeatureFlagDefinition(key);
  if (!def) throw new Error(`not in the registry: ${key}`);
  return def;
}

const STANDARD = definition("home_hub_welcome_banner");
const FROZEN = definition("check_ins");
const NAV = definition("nav_show_groups");

describe("buildFeatureFlagRow — standard flags", () => {
  it("reads Off with no stored state and no risk note", () => {
    const row = buildFeatureFlagRow(STANDARD, {});
    expect(row.kindBadge).toEqual({ label: "Standard", tone: "planned" });
    expect(row.stateBadge).toEqual({ label: "Off", tone: "disabled" });
    expect(row.riskNote).toBeNull();
    expect(row.frozen).toBe(false);
    expect(row.enabled).toBe(false);
  });

  it("reads On as soon as the switch is on", () => {
    const row = buildFeatureFlagRow(STANDARD, {
      [STANDARD.key]: { enabled: true },
    });
    expect(row.stateBadge).toEqual({ label: "On", tone: "good" });
    expect(row.enabled).toBe(true);
  });
});

describe("buildFeatureFlagRow — frozen surfaces (verify-before-flip)", () => {
  it("reads Locked off while the switch is off", () => {
    const row = buildFeatureFlagRow(FROZEN, {});
    expect(row.kindBadge).toEqual({ label: "Held", tone: "warning" });
    expect(row.stateBadge).toEqual({ label: "Locked off", tone: "guarded" });
    expect(row.riskNote).toEqual({
      text: "Held — stays off until it passes a safety review, even when switched on.",
      heldOff: false,
    });
    expect(row.frozen).toBe(true);
  });

  it("reads Held off when switched on without the verified marker", () => {
    const row = buildFeatureFlagRow(FROZEN, {
      [FROZEN.key]: { enabled: true },
    });
    expect(row.stateBadge).toEqual({ label: "Held off", tone: "warning" });
    expect(row.riskNote).toEqual({
      text: "Turned on, but held off until it passes its safety review.",
      heldOff: true,
    });
    // The toggle reflects the stored switch position even while held off.
    expect(row.enabled).toBe(true);
  });

  it("reads On only when switched on and verified", () => {
    const row = buildFeatureFlagRow(FROZEN, {
      [FROZEN.key]: { enabled: true, verified: true },
    });
    expect(row.stateBadge).toEqual({ label: "On", tone: "good" });
    // The standing held caution stays on the row; only the amber emphasis
    // is reserved for the held-off state.
    expect(row.riskNote).toEqual({
      text: "Held — stays off until it passes a safety review, even when switched on.",
      heldOff: false,
    });
  });

  it("ignores the verified marker while the switch is off", () => {
    const row = buildFeatureFlagRow(FROZEN, {
      [FROZEN.key]: { enabled: false, verified: true },
    });
    expect(row.stateBadge).toEqual({ label: "Locked off", tone: "guarded" });
    expect(row.enabled).toBe(false);
  });
});

describe("buildFeatureFlagRow — nav-visibility flags", () => {
  it("reads Hidden when off, with the direct-URL caution", () => {
    const row = buildFeatureFlagRow(NAV, {});
    expect(row.kindBadge).toEqual({ label: "Nav", tone: "planned" });
    expect(row.stateBadge).toEqual({ label: "Hidden", tone: "disabled" });
    expect(row.riskNote).toEqual({
      text: "Hiding the tab does not block access — anyone with the page's address can still open it.",
      heldOff: false,
    });
  });

  it("reads Shown when the tab flag is on", () => {
    const row = buildFeatureFlagRow(NAV, { [NAV.key]: { enabled: true } });
    expect(row.stateBadge).toEqual({ label: "Shown", tone: "good" });
  });
});

describe("buildFeatureFlagRows", () => {
  it("renders every registry flag in registry order", () => {
    const rows = buildFeatureFlagRows({});
    expect(rows.map((row) => row.key)).toEqual(
      FEATURE_FLAG_DEFINITIONS.map((def) => def.key)
    );
    expect(rows.map((row) => row.label)).toEqual(
      FEATURE_FLAG_DEFINITIONS.map((def) => def.label)
    );
  });
});
