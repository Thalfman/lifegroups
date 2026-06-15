"use client";

import type { ReactNode } from "react";
import { Tabs } from "@/components/ui/tabs";

// Issue #304: a small, accessible tab control for the Settings configuration
// area. Settings is a quiet secondary surface, so the tabs read as a calm
// segmented control rather than a loud operational toolbar. The accessible tabs
// behavior now lives in the shared `Tabs` primitive (components/ui/tabs.tsx);
// this is the Settings-flavored binding (id prefix + tablist label).

export type SettingsTab = {
  id: string;
  label: string;
  panel: ReactNode;
};

export function SettingsTabs({
  tabs,
  defaultTabId,
}: {
  tabs: SettingsTab[];
  // Default selection. Thresholds is the natural landing tab because it holds
  // the metric defaults the operator changes most; callers pass it explicitly.
  defaultTabId: string;
}) {
  return (
    <Tabs
      tabs={tabs}
      defaultTabId={defaultTabId}
      idPrefix="settings"
      ariaLabel="Settings sections"
    />
  );
}
