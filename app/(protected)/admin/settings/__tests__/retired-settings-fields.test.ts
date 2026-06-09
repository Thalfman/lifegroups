import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateGroupMetricSettingsPayload } from "@/lib/admin/validation";

// #472: Settings retired its dead and frozen check-in fields from the surface.
// Columns, RPCs, and migrations stay frozen in place — these guards pin the
// SURFACE retirement: the retired keys are never read from the submitted
// FormData, the orphan multiplication-config action stays deleted, and the
// clear path for existing stored check-in overrides keeps working.

function src(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
}

const ACTIONS = src("../actions.ts");
const METRIC_DEFAULTS_FORM = src(
  "../../../../../components/admin/forms/metric-defaults-form.tsx"
);
const GROUP_OVERRIDES_FORM = src(
  "../../../../../components/admin/forms/group-metric-overrides-form.tsx"
);

describe("settings actions — retired keys are not read from FormData", () => {
  it("keeps the check-in cadence keys out of METRIC_DEFAULT_FIELDS", () => {
    const fields = ACTIONS.match(
      /const METRIC_DEFAULT_FIELDS = \[[\s\S]*?\] as const;/
    )?.[0];
    expect(fields).toBeDefined();
    expect(fields).not.toContain("check_in_due_offset_hours");
    expect(fields).not.toContain("missed_checkin_warning_weeks");
    expect(fields).not.toContain("check_in_due_day_of_week");
  });

  it("keeps check_in_due_offset_hours_override out of GROUP_METRIC_FIELDS", () => {
    const fields = ACTIONS.match(
      /const GROUP_METRIC_FIELDS = \[[\s\S]*?\] as const;/
    )?.[0];
    expect(fields).toBeDefined();
    expect(fields).not.toContain("check_in_due_offset_hours_override");
  });

  it("still passes the (always-null) offset to the frozen full-state RPC", () => {
    // The RPC signature is frozen; passing null is the clear path for any
    // stored per-group override.
    expect(ACTIONS).toContain("p_check_in_due_offset_hours_override:");
  });
});

describe("settings actions — orphan multiplication-config action stays deleted", () => {
  it("no longer exports adminSetMultiplicationConfig or its run-action spec", () => {
    expect(ACTIONS).not.toContain(
      "export async function adminSetMultiplicationConfig"
    );
    expect(ACTIONS).not.toContain("SET_MULTIPLICATION_CONFIG_SPEC");
    expect(ACTIONS).not.toContain("rpcAdminSetMultiplicationConfig");
    expect(ACTIONS).not.toContain("validateMultiplicationConfigPayload");
  });
});

describe("settings forms — retired check-in fields no longer render or submit", () => {
  it("renders no read-only check-in reference rows in Thresholds", () => {
    expect(METRIC_DEFAULTS_FORM).not.toContain("ReadOnlyDefault");
    expect(METRIC_DEFAULTS_FORM).not.toContain("Check-in due offset");
    expect(METRIC_DEFAULTS_FORM).not.toContain("Missed check-in warning");
    expect(METRIC_DEFAULTS_FORM).not.toContain(
      "defaults.check_in_due_offset_hours"
    );
    expect(METRIC_DEFAULTS_FORM).not.toContain(
      "defaults.missed_checkin_warning_weeks"
    );
  });

  it("submits no hidden check-in offset override from the per-group form", () => {
    expect(GROUP_OVERRIDES_FORM).not.toContain(
      'name="check_in_due_offset_hours_override"'
    );
  });
});

describe("clear path — absent offset key normalizes to null", () => {
  it("validates a payload without the retired key to a null override", () => {
    // The form no longer submits the key; the validator must normalize the
    // absent field to null so the full-state upsert RPC clears any stored
    // per-group override on the next save.
    const result = validateGroupMetricSettingsPayload({
      group_id: "123e4567-e89b-12d3-a456-426614174000",
      capacity_override: "12",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.check_in_due_offset_hours_override).toBeNull();
      expect(result.value.capacity_override).toBe(12);
    }
  });
});
