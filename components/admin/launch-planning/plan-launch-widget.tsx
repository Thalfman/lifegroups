"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  eyebrowClassName,
  panelTitleClassName,
  sectionClassName,
} from "./section-styles";
import type { LaunchPlanningAssumptions } from "@/lib/admin/launch-planning";
import { Button } from "@/components/ui/button";

// The scenario form is only mounted after "Plan a launch" is clicked, so its
// (sizable) code is deferred to a chunk that loads on first open. ssr:false is
// safe precisely because it never renders on the server.
const CreateScenarioForm = dynamic(
  () =>
    import("@/components/admin/launch-planning/scenario-form").then(
      (m) => m.CreateScenarioForm
    ),
  { ssr: false }
);

// The "Plan a launch" action, lifted out of the retired launch-planning shell
// so the Planning area's Launches tab can offer the same one-click "save a
// named scenario from your current forecast" affordance (#303) without the
// frozen route's tab-switching hero. Tuning the forecast is one tab-click away
// (the Capacity tab), so this widget drops the old "Adjust forecast" shortcut.
export function PlanLaunchWidget({
  baseline,
}: {
  baseline: LaunchPlanningAssumptions;
}) {
  const [planning, setPlanning] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={() => setPlanning((open) => !open)}
        >
          {planning ? "Cancel" : "Plan a launch"}
        </Button>
        {!planning ? (
          <span className="font-sans text-xs text-ink3">
            Save a named scenario from your current forecast, or tune the
            forecast inputs in the Capacity tab.
          </span>
        ) : null}
      </div>

      {planning ? (
        <div className={sectionClassName}>
          <header className="mb-3.5">
            <span className={eyebrowClassName}>Plan a launch</span>
            <h2 className={panelTitleClassName}>
              New launch scenario from your current forecast
            </h2>
          </header>
          <CreateScenarioForm
            idPrefix="plan_launch"
            defaults={baseline}
            onClose={() => setPlanning(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
