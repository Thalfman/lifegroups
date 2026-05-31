import { describe, it, expect } from "vitest";

import {
  resolveFlag,
  isFrozenSurfaceFlag,
  getFeatureFlagDefinition,
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagsConfig,
} from "@/lib/admin/feature-flags";

const NEW_SURFACE_KEY = "home_hub_welcome_banner";
const FROZEN_SURFACE_KEY = "leader_surface";

describe("feature-flags", () => {
  describe("resolveFlag — the ADR 0009 resolution table", () => {
    it("resolves a flag that is off (or unset) to disabled", () => {
      expect(resolveFlag({}, NEW_SURFACE_KEY)).toBe(false);
      const config: FeatureFlagsConfig = {
        [NEW_SURFACE_KEY]: { enabled: false },
      };
      expect(resolveFlag(config, NEW_SURFACE_KEY)).toBe(false);
    });

    it("resolves a new-surface flag that is on to enabled", () => {
      const config: FeatureFlagsConfig = {
        [NEW_SURFACE_KEY]: { enabled: true },
      };
      expect(resolveFlag(config, NEW_SURFACE_KEY)).toBe(true);
    });

    it("resolves a frozen-surface flag on + not verified to DISABLED (the guard)", () => {
      const unmarked: FeatureFlagsConfig = {
        [FROZEN_SURFACE_KEY]: { enabled: true },
      };
      const explicitlyUnverified: FeatureFlagsConfig = {
        [FROZEN_SURFACE_KEY]: { enabled: true, verified: false },
      };
      expect(resolveFlag(unmarked, FROZEN_SURFACE_KEY)).toBe(false);
      expect(resolveFlag(explicitlyUnverified, FROZEN_SURFACE_KEY)).toBe(false);
    });

    it("resolves a frozen-surface flag on + verified to enabled", () => {
      const config: FeatureFlagsConfig = {
        [FROZEN_SURFACE_KEY]: { enabled: true, verified: true },
      };
      expect(resolveFlag(config, FROZEN_SURFACE_KEY)).toBe(true);
    });

    it("keeps a frozen-surface flag disabled when verified but turned off", () => {
      const config: FeatureFlagsConfig = {
        [FROZEN_SURFACE_KEY]: { enabled: false, verified: true },
      };
      expect(resolveFlag(config, FROZEN_SURFACE_KEY)).toBe(false);
    });

    it("fails safe: an unknown stored flag key resolves to disabled even when on", () => {
      const config: FeatureFlagsConfig = {
        not_a_real_flag: { enabled: true, verified: true },
      };
      expect(resolveFlag(config, "not_a_real_flag")).toBe(false);
    });
  });

  describe("registry", () => {
    it("classifies the tracer flag as a new surface and the ADR-0002 surfaces as frozen", () => {
      expect(isFrozenSurfaceFlag(NEW_SURFACE_KEY)).toBe(false);
      expect(isFrozenSurfaceFlag("leader_surface")).toBe(true);
      expect(isFrozenSurfaceFlag("check_ins")).toBe(true);
      expect(isFrozenSurfaceFlag("guests")).toBe(true);
    });

    it("returns undefined for an unknown definition and a definition for known keys", () => {
      expect(getFeatureFlagDefinition("nope")).toBeUndefined();
      expect(getFeatureFlagDefinition(NEW_SURFACE_KEY)?.kind).toBe(
        "new_surface"
      );
    });

    it("has unique flag keys", () => {
      const keys = FEATURE_FLAG_DEFINITIONS.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
});
