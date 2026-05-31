import { describe, it, expect } from "vitest";

import {
  resolveCopy,
  getEditableCopyDefinition,
  GROUP_HEALTH_COPY_KEYS,
  CARE_STATUS_COPY_KEYS,
  EDITABLE_COPY_DEFINITIONS,
  type EditableCopyConfig,
} from "@/lib/admin/editable-copy";

describe("editable-copy", () => {
  describe("resolveCopy — set resolves, unset falls back", () => {
    it("resolves a set group-health question wording to its value", () => {
      const config: EditableCopyConfig = {
        [GROUP_HEALTH_COPY_KEYS.spiritualGrowth]:
          "How is the group growing spiritually?",
      };
      expect(resolveCopy(config, GROUP_HEALTH_COPY_KEYS.spiritualGrowth)).toBe(
        "How is the group growing spiritually?"
      );
    });

    it("falls back to the code placeholder when a group-health key is unset", () => {
      const def = getEditableCopyDefinition(
        GROUP_HEALTH_COPY_KEYS.groupQuestion
      );
      expect(resolveCopy({}, GROUP_HEALTH_COPY_KEYS.groupQuestion)).toBe(
        def?.placeholder
      );
    });

    it("resolves a set care-status label to its value", () => {
      const config: EditableCopyConfig = {
        [CARE_STATUS_COPY_KEYS.concern]: "Urgent concern",
      };
      expect(resolveCopy(config, CARE_STATUS_COPY_KEYS.concern)).toBe(
        "Urgent concern"
      );
    });

    it("falls back to the placeholder for every unset care-status label", () => {
      for (const key of Object.values(CARE_STATUS_COPY_KEYS)) {
        const def = getEditableCopyDefinition(key);
        expect(resolveCopy({}, key)).toBe(def?.placeholder);
      }
    });

    it("treats an empty or whitespace-only stored value as unset (placeholder shows)", () => {
      const def = getEditableCopyDefinition(
        GROUP_HEALTH_COPY_KEYS.spiritualGrowth
      );
      expect(
        resolveCopy(
          { [GROUP_HEALTH_COPY_KEYS.spiritualGrowth]: "" },
          GROUP_HEALTH_COPY_KEYS.spiritualGrowth
        )
      ).toBe(def?.placeholder);
      expect(
        resolveCopy(
          { [GROUP_HEALTH_COPY_KEYS.spiritualGrowth]: "   " },
          GROUP_HEALTH_COPY_KEYS.spiritualGrowth
        )
      ).toBe(def?.placeholder);
    });

    it("ignores a non-string stored value and falls back to the placeholder", () => {
      const def = getEditableCopyDefinition(CARE_STATUS_COPY_KEYS.inactive);
      const config = {
        [CARE_STATUS_COPY_KEYS.inactive]: 42,
      } as unknown as EditableCopyConfig;
      expect(resolveCopy(config, CARE_STATUS_COPY_KEYS.inactive)).toBe(
        def?.placeholder
      );
    });

    it("returns the key itself for an unknown key (no silent blank)", () => {
      expect(resolveCopy({}, "not.a.real.key")).toBe("not.a.real.key");
    });
  });

  describe("registry", () => {
    it("covers both key families with unique keys", () => {
      const keys = EDITABLE_COPY_DEFINITIONS.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toContain(GROUP_HEALTH_COPY_KEYS.spiritualGrowth);
      expect(keys).toContain(GROUP_HEALTH_COPY_KEYS.groupQuestion);
      for (const key of Object.values(CARE_STATUS_COPY_KEYS)) {
        expect(keys).toContain(key);
      }
    });
  });
});
