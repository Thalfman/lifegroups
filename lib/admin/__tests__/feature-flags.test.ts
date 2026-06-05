import { describe, it, expect } from "vitest";

import {
  resolveFlag,
  isFrozenSurfaceFlag,
  getFeatureFlagDefinition,
  resolveMutedAttentionKeys,
  resolveHiddenNav,
  LAUNCH_MUTE_FLAG_KEYS,
  NAV_VISIBILITY_FLAGS,
  DEFAULT_HIDDEN_NAV_AREAS,
  FEATURE_FLAG_DEFINITIONS,
  type FeatureFlagsConfig,
} from "@/lib/admin/feature-flags";

const NEW_SURFACE_KEY = "home_hub_welcome_banner";
const FROZEN_SURFACE_KEY = "leader_surface";
const NAV_VISIBILITY_KEY = "nav_show_groups";

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

    it("resolves a nav-visibility flag like a plain on/off switch (no verify needed)", () => {
      expect(resolveFlag({}, NAV_VISIBILITY_KEY)).toBe(false);
      expect(
        resolveFlag(
          { [NAV_VISIBILITY_KEY]: { enabled: true } },
          NAV_VISIBILITY_KEY
        )
      ).toBe(true);
      // No `verified` marker is consulted for nav flags (unlike frozen surfaces).
      expect(
        resolveFlag(
          { [NAV_VISIBILITY_KEY]: { enabled: true, verified: false } },
          NAV_VISIBILITY_KEY
        )
      ).toBe(true);
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

    it("registers the three launch-optics mutes as plain on/off new-surface flags", () => {
      for (const key of [
        "mute_care_attention",
        "mute_health_checks",
        "mute_follow_ups",
      ]) {
        expect(getFeatureFlagDefinition(key)?.kind).toBe("new_surface");
        expect(isFrozenSurfaceFlag(key)).toBe(false);
      }
    });

    it("registers the three nav-visibility flags as their own kind (not frozen)", () => {
      for (const { key } of NAV_VISIBILITY_FLAGS) {
        expect(getFeatureFlagDefinition(key)?.kind).toBe("nav_visibility");
        expect(isFrozenSurfaceFlag(key)).toBe(false);
      }
    });

    it("keeps the nav-visibility registry and the area map in lock-step (no drift)", () => {
      // Every nav_visibility definition in the registry has a NAV_VISIBILITY_FLAGS
      // entry, and vice versa — so the resolver can never govern a tab the
      // console can't toggle, or expose a toggle the resolver ignores.
      const registryNavKeys = FEATURE_FLAG_DEFINITIONS.filter(
        (d) => d.kind === "nav_visibility"
      )
        .map((d) => d.key)
        .sort();
      const mapKeys = NAV_VISIBILITY_FLAGS.map((f) => f.key).sort();
      expect(registryNavKeys).toEqual(mapKeys);
    });
  });

  describe("resolveHiddenNav — the ADR 0016 hidden-set resolution", () => {
    it("hides every nav-visibility tab for an empty config (the pivot default)", () => {
      expect(resolveHiddenNav({})).toEqual(new Set(DEFAULT_HIDDEN_NAV_AREAS));
      // The default-hidden set is exactly the three governed areas.
      expect([...DEFAULT_HIDDEN_NAV_AREAS].sort()).toEqual(
        ["/admin/groups", "/admin/people", "/admin/planning"].sort()
      );
    });

    it("drops an area from the hidden set when its flag is enabled", () => {
      const hidden = resolveHiddenNav({ nav_show_groups: { enabled: true } });
      expect(hidden.has("/admin/groups")).toBe(false);
      // The others stay hidden.
      expect(hidden.has("/admin/people")).toBe(true);
      expect(hidden.has("/admin/planning")).toBe(true);
    });

    it("re-shows every tab when all three flags are on", () => {
      const config: FeatureFlagsConfig = Object.fromEntries(
        NAV_VISIBILITY_FLAGS.map((f) => [f.key, { enabled: true }])
      );
      expect(resolveHiddenNav(config)).toEqual(new Set());
    });

    it("keeps a tab hidden when its flag is present but off", () => {
      const hidden = resolveHiddenNav({
        nav_show_planning: { enabled: false },
      });
      expect(hidden.has("/admin/planning")).toBe(true);
    });

    it("fails safe: an unknown stored flag key reveals nothing", () => {
      const hidden = resolveHiddenNav({ nav_show_bogus: { enabled: true } });
      expect(hidden).toEqual(new Set(DEFAULT_HIDDEN_NAV_AREAS));
    });
  });

  describe("resolveMutedAttentionKeys", () => {
    it("mutes nothing for an empty config (the default — every category shows)", () => {
      expect(resolveMutedAttentionKeys({})).toEqual(new Set());
    });

    it("maps each mute flag to the needs-attention category key it suppresses", () => {
      expect(
        resolveMutedAttentionKeys({ mute_care_attention: { enabled: true } })
      ).toEqual(new Set(["care_attention"]));
      expect(
        resolveMutedAttentionKeys({ mute_health_checks: { enabled: true } })
      ).toEqual(new Set(["health"]));
      expect(
        resolveMutedAttentionKeys({ mute_follow_ups: { enabled: true } })
      ).toEqual(new Set(["follow_ups"]));
    });

    it("ignores a mute flag that is present but off", () => {
      expect(
        resolveMutedAttentionKeys({ mute_health_checks: { enabled: false } })
      ).toEqual(new Set());
    });

    it("mutes all three time-based categories when every mute is on", () => {
      const config: FeatureFlagsConfig = {
        mute_care_attention: { enabled: true },
        mute_health_checks: { enabled: true },
        mute_follow_ups: { enabled: true },
      };
      expect(resolveMutedAttentionKeys(config)).toEqual(
        new Set(["care_attention", "health", "follow_ups"])
      );
    });
  });

  describe("launch-prep mute helpers", () => {
    it("LAUNCH_MUTE_FLAG_KEYS lists exactly the time-based mute flags", () => {
      expect([...LAUNCH_MUTE_FLAG_KEYS].sort()).toEqual(
        ["mute_care_attention", "mute_follow_ups", "mute_health_checks"].sort()
      );
    });

    it("every launch mute key is a known new-surface flag (no drift)", () => {
      for (const key of LAUNCH_MUTE_FLAG_KEYS) {
        const def = getFeatureFlagDefinition(key);
        expect(def, `missing definition for ${key}`).toBeDefined();
        expect(def?.kind).toBe("new_surface");
      }
    });

    it("enabling exactly the launch mute keys mutes all three categories", () => {
      // The atomic super_admin_launch_prep RPC enables these keys; the dashboard
      // reads them back through resolveMutedAttentionKeys. Round-trip so the
      // launch-prep key set and the dashboard filter can't drift apart.
      const config: FeatureFlagsConfig = Object.fromEntries(
        LAUNCH_MUTE_FLAG_KEYS.map((k) => [k, { enabled: true }])
      );
      expect(resolveMutedAttentionKeys(config)).toEqual(
        new Set(["care_attention", "health", "follow_ups"])
      );
    });
  });
});
